'use client';

import { fromPromise } from 'xstate';
import type { Client } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
  AIGenerationService,
  GetJobRequestSchema,
  GetCoursePlanRequestSchema,
  ApproveCoursePlanRequestSchema,
  ListJobsRequestSchema,
  GenerateCourseOutlineRequestSchema,
  type GenerateCourseOutlineResponse,
} from '@/gen/mirai/v1/ai_generation_service_pb';
import {
  CourseGenerationInputSchema,
} from '@/gen/mirai/v1/ai_generation_types_pb';
import { GenerationJobStatus, GenerationJobType } from '@/gen/mirai/v1/ai_generation_types_pb';

type AIClient = Client<typeof AIGenerationService>;

/**
 * Creates concrete actor implementations for the plan review machine.
 * These are passed to `planReviewMachine.provide({ actors: ... })`.
 */
export function createPlanReviewActors(aiClient: AIClient) {
  return {
    loadPlanActor: fromPromise(async ({ input }: { input: { courseId: string; initialJobId?: string } }) => {
      console.log('[PlanPage] loadPlanActor START', { courseId: input.courseId, initialJobId: input.initialJobId });

      // Step 1: Try to get the plan
      try {
        const planRequest = create(GetCoursePlanRequestSchema, { courseId: input.courseId });
        const planResponse = await aiClient.getCoursePlan(planRequest);
        if (planResponse.plan) {
          console.log('[PlanPage] Plan found!', {
            status: planResponse.plan.status,
            sectionsCount: planResponse.plan.plannedSections?.length,
            docsCount: planResponse.plan.documentAnalyses?.length,
          });
          return { plan: planResponse.plan, job: null };
        }
        console.log('[PlanPage] getCoursePlan returned no plan');
      } catch (err) {
        console.log('[PlanPage] getCoursePlan threw error (expected if plan not ready):', err instanceof Error ? err.message : err);
      }

      // Step 2: If we have an initial job ID from the wizard, use it directly
      if (input.initialJobId) {
        try {
          const jobRequest = create(GetJobRequestSchema, { jobId: input.initialJobId });
          const jobResponse = await aiClient.getJob(jobRequest);
          const job = jobResponse.job;
          if (job && (job.status === GenerationJobStatus.QUEUED || job.status === GenerationJobStatus.PROCESSING)) {
            console.log('[PlanPage] Job is active, returning for polling');
            return {
              plan: null,
              job: {
                id: job.id,
                status: job.status,
                progressPercent: job.progressPercent ?? 0,
                progressMessage: job.progressMessage,
              },
            };
          }
        } catch (err) {
          console.error('[PlanPage] Failed to get job by initialJobId:', err instanceof Error ? err.message : err);
        }
      }

      // Step 3: Fallback - list jobs to find active planning job
      try {
        const listRequest = create(ListJobsRequestSchema, { courseId: input.courseId });
        const listResponse = await aiClient.listJobs(listRequest);
        const jobs = listResponse.jobs ?? [];

        const activePlanJob = jobs.find(
          (job) =>
            job.type === GenerationJobType.COURSE_PLANNING &&
            (job.status === GenerationJobStatus.QUEUED || job.status === GenerationJobStatus.PROCESSING)
        );

        if (activePlanJob) {
          console.log('[PlanPage] Found active planning job via list:', activePlanJob.id);
          return {
            plan: null,
            job: {
              id: activePlanJob.id,
              status: activePlanJob.status,
              progressPercent: activePlanJob.progressPercent ?? 0,
              progressMessage: activePlanJob.progressMessage,
            },
          };
        }
      } catch (err) {
        console.error('[PlanPage] listJobs failed:', err instanceof Error ? err.message : err);
      }

      return { plan: null, job: null };
    }),

    pollJobActor: fromPromise(async ({ input }: { input: { jobId: string } }) => {
      const jobRequest = create(GetJobRequestSchema, { jobId: input.jobId });
      const jobResponse = await aiClient.getJob(jobRequest);
      return { job: jobResponse.job };
    }),

    getPlanActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
      const planRequest = create(GetCoursePlanRequestSchema, { courseId: input.courseId });
      const planResponse = await aiClient.getCoursePlan(planRequest);
      if (!planResponse.plan) {
        throw new Error('Course plan not found');
      }
      return { plan: planResponse.plan };
    }),

    approvePlanActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
      const request = create(ApproveCoursePlanRequestSchema, { courseId: input.courseId });
      const response = await aiClient.approveCoursePlan(request);
      if (!response.plan) {
        throw new Error('Failed to approve course plan');
      }
      return { plan: response.plan };
    }),

    generateOutlineActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
      const request = create(GenerateCourseOutlineRequestSchema, {
        input: create(CourseGenerationInputSchema, {
          courseId: input.courseId,
          desiredOutcome: '',
        }),
      });
      const response = await aiClient.generateCourseOutline(request);
      if (!response.job) {
        throw new Error('Failed to start outline generation');
      }
      return { job: response.job };
    }),
  };
}
