import { NextRequest, NextResponse } from 'next/server';
import {
  loadCourse,
  updateCourse,
  deleteCourse,
  StoredCourse
} from '@/lib/storage/courseStorage';
import { getCache, CacheKeys } from '@/lib/cache/redisCache';

// GET /api/courses/[id] - Get a specific course
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const course = await loadCourse(params.id);

    if (!course) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: course
    });
  } catch (error) {
    console.error(`Error loading course ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load course'
      },
      { status: 500 }
    );
  }
}

// PUT /api/courses/[id] - Update a course
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    // Prepare updates - only include fields that were provided
    const updates: Partial<StoredCourse> = {};

    if (body.settings) updates.settings = body.settings;
    if (body.personas) updates.personas = body.personas;
    if (body.learningObjectives) updates.learningObjectives = body.learningObjectives;
    if (body.assessmentSettings) updates.assessmentSettings = body.assessmentSettings;
    if (body.content) updates.content = body.content;
    if (body.status) updates.status = body.status;
    if (body.metadata) updates.metadata = body.metadata;

    const course = await updateCourse(params.id, updates);

    if (!course) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: course
    });
  } catch (error) {
    console.error(`Error updating course ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update course'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/courses/[id] - Delete a course
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const success = await deleteCourse(params.id);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to delete course'
        },
        { status: 500 }
      );
    }

    // Bust all related caches after successful deletion
    const cache = getCache();
    await cache.connect();

    // Invalidate library cache (library.json)
    await cache.delete(CacheKeys.library());

    // Invalidate folder hierarchy caches (especially withCounts for content library)
    await cache.delete(CacheKeys.folders());
    await cache.delete(`${CacheKeys.folders()}:withCounts`);

    // Invalidate all course-related caches
    await cache.invalidatePattern('courses:*');

    // Invalidate folder-specific course caches
    await cache.invalidatePattern('folder:*');

    // Invalidate the specific course cache
    await cache.delete(CacheKeys.course(params.id));

    console.log(`Cache invalidated for deleted course ${params.id}`);

    return NextResponse.json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error(`Error deleting course ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete course'
      },
      { status: 500 }
    );
  }
}