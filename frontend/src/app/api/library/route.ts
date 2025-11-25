import { NextRequest, NextResponse } from 'next/server';
import {
  loadLibrary,
  getRecentCourses,
  getFolders,
  getCoursesByFolder,
  buildFolderHierarchy
} from '@/lib/storage/courseStorage';

// GET /api/library - Get library index with courses and folders
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const view = searchParams.get('view'); // 'recent', 'folders', or 'all'
    const folderId = searchParams.get('folder'); // Filter by folder ID
    const includeSubfolders = searchParams.get('includeSubfolders') !== 'false';

    // If filtering by folder
    if (folderId) {
      const courses = await getCoursesByFolder(folderId, includeSubfolders);
      return NextResponse.json({
        success: true,
        data: {
          courses,
          folderId
        }
      });
    }

    if (view === 'recent') {
      const courses = await getRecentCourses();
      return NextResponse.json({
        success: true,
        data: courses
      });
    }

    if (view === 'folders') {
      const folders = await getFolders();
      const hierarchy = buildFolderHierarchy(folders);
      return NextResponse.json({
        success: true,
        data: hierarchy
      });
    }

    // Return full library with hierarchical folders
    const library = await loadLibrary();
    const hierarchy = buildFolderHierarchy(library.folders);

    // Add course counts to each folder
    const addCourseCounts = async (folder: any) => {
      const courses = await getCoursesByFolder(folder.id, false);
      folder.courseCount = courses.length;

      if (folder.children && Array.isArray(folder.children)) {
        for (const child of folder.children) {
          await addCourseCounts(child);
        }
      }
    };

    for (const folder of hierarchy) {
      await addCourseCounts(folder);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...library,
        folders: hierarchy
      }
    });
  } catch (error) {
    console.error('Error loading library:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load library'
      },
      { status: 500 }
    );
  }
}