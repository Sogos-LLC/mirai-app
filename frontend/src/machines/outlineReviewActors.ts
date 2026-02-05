'use client';

import { fromPromise } from 'xstate';
import { createClient, type Client } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
  AIGenerationService,
  GetJobRequestSchema,
  GetCourseOutlineRequestSchema,
  ListJobsRequestSchema,
} from '@/gen/mirai/v1/ai_generation_service_pb';
import { GenerationJobStatus } from '@/gen/mirai/v1/ai_generation_types_pb';
import type {
  GenerateCourseOutlineResponse,
  GenerateAllLessonsResponse,
} from '@/gen/mirai/v1/ai_generation_service_pb';

type AIClient = Client<typeof AIGenerationService>;

interface GenerateOutlineMutate {
  mutate: (params: { courseId: string; desiredOutcome: string }) => Promise<GenerateCourseOutlineResponse>;
}

interface GenerateLessonsMutate {
  mutate: (courseId: string) => Promise<GenerateAllLessonsResponse>;
}

/**
 * Creates concrete actor implementations for the outline review machine.
 * These are passed to `outlineReviewMachine.provide({ actors: ... })`.
 */
export function createOutlineReviewActors(
  aiClient: AIClient,
  generateCourseOutline: GenerateOutlineMutate,
  generateAllLessons: GenerateLessonsMutate,
) {
  return {
    loadOutlineActor: fromPromise(async ({ input }: { input: { courseId: string; initialJobId?: string } }) => {
      console.log('[OutlinePage] loadOutlineActor START', { courseId: input.courseId, initialJobId: input.initialJobId });

      // Step 1: Try to get the outline
      try {
        console.log('[OutlinePage] Attempting to fetch outline via connect client...');
        const outlineRequest = create(GetCourseOutlineRequestSchema, { courseId: input.courseId });
        const outlineResponse = await aiClient.getCourseOutline(outlineRequest);
        if (outlineResponse.outline) {
          console.log('[OutlinePage] Outline found!', {
            outlineId: outlineResponse.outline.id,
            sectionsCount: outlineResponse.outline.sections?.length,
          });
          return { outline: outlineResponse.outline, job: null };
        }
        console.log('[OutlinePage] getCourseOutline returned no outline');
      } catch (err) {
        console.log('[OutlinePage] getCourseOutline threw error (expected if outline not ready):', err instanceof Error ? err.message : err);
      }

      // Step 2: If we have an initial job ID from the wizard, use it directly
      if (input.initialJobId) {
        console.log('[OutlinePage] Attempting to fetch job by initialJobId via connect client:', input.initialJobId);
        try {
          const jobRequest = create(GetJobRequestSchema, { jobId: input.initialJobId });
          const jobResponse = await aiClient.getJob(jobRequest);
          const job = jobResponse.job;
          console.log('[OutlinePage] GetJob response:', {
            jobId: job?.id,
            status: job?.status,
            statusName: job?.status !== undefined ? GenerationJobStatus[job.status] : 'undefined',
            progress: job?.progressPercent,
            errorMessage: job?.errorMessage,
          });

          if (job && (job.status === GenerationJobStatus.QUEUED || job.status === GenerationJobStatus.PROCESSING)) {
            console.log('[OutlinePage] Job is active (QUEUED or PROCESSING), returning job for polling');
            return {
              outline: null,
              job: {
                id: job.id,
                status: job.status,
                progressPercent: job.progressPercent ?? 0,
                progressMessage: job.progressMessage,
              },
            };
          } else {
            console.log('[OutlinePage] Job exists but not in active state, status:', job?.status, GenerationJobStatus[job?.status ?? 0]);
          }
        } catch (err) {
          console.error('[OutlinePage] Failed to get job by initialJobId:', err instanceof Error ? err.message : err);
        }
      } else {
        console.log('[OutlinePage] No initialJobId provided');
      }

      // Step 3: Fallback - list jobs by courseId
      console.log('[OutlinePage] Falling back to listJobs via connect client...');
      try {
        const listRequest = create(ListJobsRequestSchema, { courseId: input.courseId });
        const listResponse = await aiClient.listJobs(listRequest);
        const jobs = listResponse.jobs ?? [];
        console.log('[OutlinePage] listJobs returned', jobs.length, 'jobs');
        jobs.forEach((job, i) => {
          console.log(`[OutlinePage] Job ${i}:`, {
            id: job.id,
            status: job.status,
            statusName: GenerationJobStatus[job.status],
            courseId: job.courseId,
          });
        });

        const activeOutlineJob = jobs.find(
          (job) =>
            job.status === GenerationJobStatus.QUEUED ||
            job.status === GenerationJobStatus.PROCESSING
        );

        if (activeOutlineJob) {
          console.log('[OutlinePage] Found active job via list:', activeOutlineJob.id);
          return {
            outline: null,
            job: {
              id: activeOutlineJob.id,
              status: activeOutlineJob.status,
              progressPercent: activeOutlineJob.progressPercent ?? 0,
              progressMessage: activeOutlineJob.progressMessage,
            },
          };
        } else {
          console.log('[OutlinePage] No active job found in list');
        }
      } catch (err) {
        console.error('[OutlinePage] listJobs failed:', err instanceof Error ? err.message : err);
      }

      console.log('[OutlinePage] loadOutlineActor END - returning null outline and null job (will show error)');
      return { outline: null, job: null };
    }),

    pollJobActor: fromPromise(async ({ input }: { input: { jobId: string } }) => {
      const jobRequest = create(GetJobRequestSchema, { jobId: input.jobId });
      const jobResponse = await aiClient.getJob(jobRequest);
      return { job: jobResponse.job };
    }),

    pollLessonJobActor: fromPromise(async ({ input }: { input: { jobId: string } }) => {
      const jobRequest = create(GetJobRequestSchema, { jobId: input.jobId });
      const jobResponse = await aiClient.getJob(jobRequest);
      return { job: jobResponse.job };
    }),

    getOutlineActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
      const outlineRequest = create(GetCourseOutlineRequestSchema, { courseId: input.courseId });
      const outlineResponse = await aiClient.getCourseOutline(outlineRequest);
      if (!outlineResponse.outline) {
        throw new Error('Outline not found');
      }
      return { outline: outlineResponse.outline };
    }),

    regenerateOutlineActor: fromPromise(
      async ({ input }: { input: { courseId: string } }) => {
        const result = await generateCourseOutline.mutate({
          courseId: input.courseId,
          desiredOutcome: '',
        });
        return { job: result.job! };
      }
    ),

    generateLessonsActor: fromPromise(
      async ({ input }: { input: { courseId: string } }) => {
        console.log('[DEBUG-COURSEID] OutlinePage generateLessonsActor: calling generateAllLessons with courseId:', input.courseId);
        const result = await generateAllLessons.mutate(input.courseId);
        console.log('[DEBUG-COURSEID] OutlinePage generateLessonsActor: job created', {
          jobId: result.job?.id,
          courseId: input.courseId,
        });
        return { job: result.job! };
      }
    ),
  };
}
