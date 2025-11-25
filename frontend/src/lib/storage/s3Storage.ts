import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { Readable } from 'stream';

// S3/MinIO storage adapter for production
export class S3Storage {
  private s3Client: S3Client;
  private bucket: string;
  private basePath: string;

  constructor() {
    // Use environment variables for configuration
    const endpoint = process.env.S3_ENDPOINT || 'http://192.168.1.226:9768';
    const region = process.env.S3_REGION || 'us-east-1';
    this.bucket = process.env.S3_BUCKET || 'mirai';
    this.basePath = process.env.S3_BASE_PATH || 'data';

    // SECURITY: Never hardcode credentials in source code!
    // These MUST be provided via environment variables
    if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
      throw new Error(
        'S3_ACCESS_KEY and S3_SECRET_KEY environment variables are required. ' +
        'Never hardcode credentials in source code!'
      );
    }

    // Determine if endpoint uses HTTP or HTTPS
    const isHttps = endpoint.startsWith('https://');

    // Create appropriate agent based on protocol
    const httpAgent = new HttpAgent({
      keepAlive: true,
      maxSockets: 50,        // Maximum concurrent connections
      keepAliveMsecs: 10000, // Keep alive for 10 seconds
    });

    const httpsAgent = new HttpsAgent({
      keepAlive: true,
      maxSockets: 50,
      keepAliveMsecs: 10000,
    });

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
      requestHandler: new NodeHttpHandler({
        httpAgent: httpAgent,
        httpsAgent: httpsAgent,
        connectionTimeout: 5000,
        socketTimeout: 5000,
      }),
      maxAttempts: 3, // Retry failed requests up to 3 times
    });
  }

  // Read a JSON file from S3/MinIO
  async readJSON(key: string): Promise<any> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: `${this.basePath}/${key}`,
      });

      const response = await this.s3Client.send(command);
      const str = await this.streamToString(response.Body as Readable);
      return JSON.parse(str);
    } catch (error) {
      console.error(`Error reading from S3: ${key}`, error);
      throw error;
    }
  }

  // Write a JSON file to S3/MinIO
  async writeJSON(key: string, data: any): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${this.basePath}/${key}`,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json',
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error(`Error writing to S3: ${key}`, error);
      throw error;
    }
  }

  // List files in a directory
  async listFiles(prefix: string): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${this.basePath}/${prefix}`,
      });

      const response = await this.s3Client.send(command);
      return (response.Contents || [])
        .map(item => item.Key || '')
        .filter(key => key.endsWith('.json'));
    } catch (error) {
      console.error(`Error listing S3 files: ${prefix}`, error);
      throw error;
    }
  }

  // Delete a file from S3/MinIO
  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: `${this.basePath}/${key}`,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error(`Error deleting from S3: ${key}`, error);
      throw error;
    }
  }

  // Check if object exists in S3/MinIO
  async objectExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: `${this.basePath}/${key}`,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      console.error(`Error checking S3 object existence: ${key}`, error);
      throw error;
    }
  }

  // Helper to convert stream to string
  private async streamToString(stream: Readable): Promise<string> {
    const chunks: any[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }
}

// Lazy singleton instance to avoid errors during build time
let _s3StorageInstance: S3Storage | null = null;

export const s3Storage = {
  get instance(): S3Storage {
    if (!_s3StorageInstance) {
      _s3StorageInstance = new S3Storage();
    }
    return _s3StorageInstance;
  },

  // Delegate methods to the lazy instance
  readJSON: (key: string) => s3Storage.instance.readJSON(key),
  writeJSON: (key: string, data: any) => s3Storage.instance.writeJSON(key, data),
  listFiles: (prefix: string) => s3Storage.instance.listFiles(prefix),
  deleteObject: (key: string) => s3Storage.instance.deleteObject(key),
  objectExists: (key: string) => s3Storage.instance.objectExists(key),
};