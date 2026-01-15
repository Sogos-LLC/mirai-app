/**
 * AI Generation Client - Direct connect-rpc client for use in XState actors
 *
 * This provides a non-hook API for calling AIGenerationService.
 * Use this in XState actors or other non-component code.
 * For React components, prefer using the hooks from @/hooks/useAIGeneration.
 */

import { GenerationJobStatus, type GenerationJob, type CourseOutline } from '@/gen/mirai/v1/ai_generation_pb';

// Helper to call a Connect service method
async function callMethod<I, O>(
  service: string,
  method: string,
  request: I
): Promise<O> {
  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/${service}/${method}`;

  console.log(`[AIGenClient] ${method} request:`, JSON.stringify(request));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AIGenClient] ${method} failed:`, response.status, errorText);
    throw new Error(`Connect call failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log(`[AIGenClient] ${method} response:`, JSON.stringify(result));
  return result;
}

/**
 * Job result with all fields
 */
export interface JobResult {
  id: string;
  status: GenerationJobStatus;
  courseId?: string;
  errorMessage?: string;
  progress?: number;
  resultId?: string;
}

/**
 * Get a generation job by ID
 */
export async function getJob(jobId: string): Promise<JobResult> {
  const response = await callMethod<{ jobId: string }, { job: JobResult }>(
    'mirai.v1.AIGenerationService',
    'GetJob',
    { jobId }
  );
  return response.job;
}

/**
 * Get course outline by course ID
 */
export async function getCourseOutline(courseId: string): Promise<CourseOutline | undefined> {
  const response = await callMethod<{ courseId: string }, { outline: CourseOutline }>(
    'mirai.v1.AIGenerationService',
    'GetCourseOutline',
    { courseId }
  );
  return response.outline;
}

/**
 * Approve a course outline
 */
export async function approveCourseOutline(outlineId: string): Promise<{ outline: CourseOutline }> {
  const response = await callMethod<{ outlineId: string }, { outline: CourseOutline }>(
    'mirai.v1.AIGenerationService',
    'ApproveCourseOutline',
    { outlineId }
  );
  return response;
}

/**
 * List jobs by course ID, optionally filtered by type and status
 */
export async function listJobsByCourse(
  courseId: string,
  options?: {
    type?: number;
    status?: number;
  }
): Promise<JobResult[]> {
  const request: Record<string, unknown> = { courseId };
  if (options?.type !== undefined) {
    request.type = options.type;
  }
  if (options?.status !== undefined) {
    request.status = options.status;
  }

  const response = await callMethod<Record<string, unknown>, { jobs: JobResult[] }>(
    'mirai.v1.AIGenerationService',
    'ListJobs',
    request
  );
  return response.jobs ?? [];
}

// Re-export status enum for convenience
export { GenerationJobStatus };
