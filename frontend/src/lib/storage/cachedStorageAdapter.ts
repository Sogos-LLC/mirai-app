/**
 * Cached Storage Adapter with Optimistic Locking
 * Wraps the base storage adapter with Redis caching and race condition prevention
 */

import { IStorageAdapter } from './storageAdapter';
import { getCache, CacheKeys } from '../cache/redisCache';

export class CachedStorageAdapter implements IStorageAdapter {
  private cache = getCache();
  private initialized = false;

  constructor(private baseAdapter: IStorageAdapter) {}

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.cache.connect();
      this.initialized = true;
    }
  }

  /**
   * Read JSON with caching
   */
  async readJSON(filePath: string): Promise<any> {
    await this.ensureInitialized();

    // Generate cache key based on file path
    const cacheKey = this.getCacheKey(filePath);

    // Try to get from cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log(`Cache HIT: ${filePath}`);
      return cached.data;
    }

    console.log(`Cache MISS: ${filePath}`);

    // Read from storage
    const data = await this.baseAdapter.readJSON(filePath);

    // Cache the result
    await this.cache.set(cacheKey, data);

    return data;
  }

  /**
   * Write JSON with optimistic locking and cache invalidation
   */
  async writeJSON(filePath: string, data: any): Promise<void> {
    await this.ensureInitialized();

    const cacheKey = this.getCacheKey(filePath);
    const isLibrary = filePath.includes('library.json');

    // For critical files like library.json, use distributed locking
    if (isLibrary) {
      const maxRetries = 3;
      let retries = 0;

      while (retries < maxRetries) {
        const { acquired, lockId } = await this.cache.acquireLock('library-write', 10);

        if (acquired) {
          try {
            // Read current version for optimistic locking
            const current = await this.cache.get(cacheKey);
            const currentEtag = current?.etag;

            // Add version to data for tracking
            if (isLibrary && !data.version) {
              data.version = '1.0.0';
            }
            if (isLibrary && !data.etag) {
              data.etag = this.generateEtag(data);
            }

            // Write to storage
            await this.baseAdapter.writeJSON(filePath, data);

            // Update cache with new etag
            const { success, newEtag } = await this.cache.set(cacheKey, data, currentEtag);

            if (!success && currentEtag) {
              // Concurrent modification detected
              console.warn(`Concurrent modification detected for ${filePath}, retrying...`);
              retries++;
              continue;
            }

            // Invalidate related caches
            await this.invalidateRelatedCaches(filePath);

            // Success - release lock and return
            await this.cache.releaseLock('library-write', lockId);
            return;
          } catch (error) {
            // Release lock on error
            await this.cache.releaseLock('library-write', lockId);
            throw error;
          }
        } else {
          // Could not acquire lock, wait and retry
          console.log(`Waiting for lock on ${filePath}...`);
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries)));
          retries++;
        }
      }

      throw new Error(`Failed to acquire lock for writing ${filePath} after ${maxRetries} attempts`);
    } else {
      // For non-critical files, just write and invalidate cache
      await this.baseAdapter.writeJSON(filePath, data);
      await this.cache.delete(cacheKey);
      await this.invalidateRelatedCaches(filePath);
    }
  }

  /**
   * List files (not cached as it's typically fast)
   */
  async listFiles(directory: string): Promise<string[]> {
    return this.baseAdapter.listFiles(directory);
  }

  /**
   * Ensure directory exists
   */
  async ensureDirectory(directory: string): Promise<void> {
    return this.baseAdapter.ensureDirectory(directory);
  }

  /**
   * Delete file and invalidate cache
   */
  async deleteFile(filePath: string): Promise<void> {
    await this.ensureInitialized();

    // Delete from storage if method exists
    if (this.baseAdapter.deleteFile) {
      await this.baseAdapter.deleteFile(filePath);
    }

    // Invalidate cache
    const cacheKey = this.getCacheKey(filePath);
    await this.cache.delete(cacheKey);
    await this.invalidateRelatedCaches(filePath);
  }

  /**
   * Check if file exists (with caching)
   */
  async exists(filePath: string): Promise<boolean> {
    await this.ensureInitialized();

    // Check cache first
    const cacheKey = `exists:${this.getCacheKey(filePath)}`;
    const cached = await this.cache.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached.data;
    }

    // Check storage if method exists
    if (this.baseAdapter.exists) {
      const exists = await this.baseAdapter.exists(filePath);

      // Cache the result for 60 seconds
      await this.cache.set(cacheKey, exists, undefined, 60);

      return exists;
    }

    // Fallback: assume file exists if we can't check
    return true;
  }

  /**
   * Generate cache key from file path
   */
  private getCacheKey(filePath: string): string {
    if (filePath.includes('library.json')) {
      return CacheKeys.library();
    }

    const match = filePath.match(/course-([^/]+)\.json/);
    if (match) {
      return CacheKeys.course(match[1]);
    }

    // Default cache key
    return `file:${filePath.replace(/[^a-zA-Z0-9]/g, ':')}`;
  }

  /**
   * Invalidate related caches when a file changes
   */
  private async invalidateRelatedCaches(filePath: string): Promise<void> {
    if (filePath.includes('library.json')) {
      // Library changed, invalidate all course lists and folder hierarchy
      await this.cache.delete(CacheKeys.folders());
      await this.cache.delete(`${CacheKeys.folders()}:withCounts`); // Also invalidate folder counts cache
      await this.cache.invalidatePattern('courses:*');
      await this.cache.invalidatePattern('folder:*');
    } else if (filePath.includes('course-')) {
      // Course changed, invalidate library and course lists
      await this.cache.delete(CacheKeys.library());
      await this.cache.delete(CacheKeys.folders());
      await this.cache.delete(`${CacheKeys.folders()}:withCounts`); // Also invalidate folder counts cache
      await this.cache.invalidatePattern('courses:*');
      await this.cache.invalidatePattern('folder:*');
    }
  }

  /**
   * Generate etag for data
   */
  private generateEtag(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `W/"${Math.abs(hash).toString(36)}-${Date.now().toString(36)}"`;
  }
}

/**
 * Factory function to create cached storage adapter
 */
export function createCachedStorageAdapter(baseAdapter: IStorageAdapter): IStorageAdapter {
  return new CachedStorageAdapter(baseAdapter);
}