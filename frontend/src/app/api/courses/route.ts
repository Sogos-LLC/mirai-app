import { NextRequest, NextResponse } from 'next/server';
import {
  createCourse,
  listCourses,
  StoredCourse
} from '@/lib/storage/courseStorage';

// GET /api/courses - List all courses with optional filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as 'draft' | 'published' | null;
    const folder = searchParams.get('folder');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);

    const filters: any = {};
    if (status) filters.status = status;
    if (folder) filters.folder = folder;
    if (tags && tags.length > 0) filters.tags = tags;

    const courses = await listCourses(Object.keys(filters).length > 0 ? filters : undefined);

    return NextResponse.json({
      success: true,
      data: courses
    });
  } catch (error) {
    console.error('Error listing courses:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to list courses'
      },
      { status: 500 }
    );
  }
}

// POST /api/courses - Create a new course
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Create course with provided data or defaults
    const courseData: Partial<StoredCourse> = {
      id: body.id, // Use provided ID if available
      settings: {
        title: body.title || 'Untitled Course',
        desiredOutcome: body.desiredOutcome || '',
        destinationFolder: body.destinationFolder || '',
        categoryTags: body.categoryTags || [],
        dataSource: body.dataSource || 'open-web'
      },
      personas: body.personas || [],
      learningObjectives: body.learningObjectives || [],
      assessmentSettings: body.assessmentSettings || {
        enableEmbeddedKnowledgeChecks: false,
        enableFinalExam: false
      },
      content: body.content || {
        sections: [],
        courseBlocks: []
      }
    };

    const course = await createCourse(courseData);

    return NextResponse.json({
      success: true,
      data: course
    });
  } catch (error) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create course'
      },
      { status: 500 }
    );
  }
}