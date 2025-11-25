import { NextRequest, NextResponse } from 'next/server';
import {
  getFolders,
  buildFolderHierarchy,
  getCoursesByFolder,
  getFolderPath
} from '@/lib/storage/courseStorage';
import { getCache, CacheKeys } from '@/lib/cache/redisCache';

// GET /api/folders - Get hierarchical folder structure or specific folder details
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get('id');
    const format = searchParams.get('format') || 'hierarchy';
    const includeCourseCount = searchParams.get('includeCourseCount') === 'true';

    const cache = getCache();
    await cache.connect();

    const folders = await getFolders();

    // If requesting specific folder details
    if (folderId) {
      const folder = folders.find(f => f.id === folderId);

      if (!folder) {
        return NextResponse.json(
          {
            success: false,
            error: 'Folder not found',
          },
          { status: 404 }
        );
      }

      const folderPath = await getFolderPath(folderId);
      const courses = await getCoursesByFolder(folderId, false);
      const subfolderCourses = await getCoursesByFolder(folderId, true);

      return NextResponse.json({
        success: true,
        data: {
          ...folder,
          path: folderPath,
          courseCount: courses.length,
          totalCourseCount: subfolderCourses.length,
        },
      });
    }

    // Try to get cached folder hierarchy
    const cacheKey = includeCourseCount ? `${CacheKeys.folders()}:withCounts` : CacheKeys.folders();
    let result: any;

    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`Cache HIT: folders hierarchy ${includeCourseCount ? 'with counts' : ''}`);
      return NextResponse.json({
        success: true,
        data: cached.data,
      });
    }
    console.log(`Cache MISS: folders hierarchy ${includeCourseCount ? 'with counts' : ''}`);

    if (format === 'flat') {
      // Return flat array as stored
      result = folders;
    } else {
      // Return hierarchical structure (default)
      result = buildFolderHierarchy(folders);
    }

    // Cache the hierarchy
    // Base structure: 24 hour TTL since it rarely changes
    // With counts: 5 minute TTL since course counts change more frequently
    const ttl = includeCourseCount ? 300 : 86400; // 5 minutes or 24 hours

    // Optionally add course counts
    if (includeCourseCount) {
      const addCourseCount = async (folder: any) => {
        const courses = await getCoursesByFolder(folder.id, false);
        folder.courseCount = courses.length;

        // Process children recursively
        if (folder.children && Array.isArray(folder.children)) {
          for (const child of folder.children) {
            await addCourseCount(child);
          }
        }
      };

      if (Array.isArray(result)) {
        for (const folder of result) {
          await addCourseCount(folder);
        }
      } else {
        await addCourseCount(result);
      }
    }

    // Cache the final result
    await cache.set(cacheKey, result, undefined, ttl);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching folders:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch folders',
      },
      { status: 500 }
    );
  }
}

