'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMachine } from '@xstate/react';
import { fromPromise } from 'xstate';
import { X, AlertTriangle } from 'lucide-react';

// Machine and types
import {
  courseGenerationMachine,
  type CourseGenerationInput,
  type CourseGenerationContext,
} from '@/machines/courseGenerationMachine';

// Components
import { AIGenerationWizard } from './AIGenerationWizard';
import { GenerationProgressPanel } from './GenerationProgressPanel';
import { OutlineReviewPanel } from './OutlineReviewPanel';
import { GenerationQueuedConfirmation } from './GenerationQueuedConfirmation';

// Hooks
import { useListSMEs, type SubjectMatterExpert } from '@/hooks/useSME';
import { useListTargetAudiences, type TargetAudienceTemplate } from '@/hooks/useTargetAudience';
import {
  useGenerateCourseOutline,
  useGetCourseOutline,
  useApproveCourseOutline,
  useRejectCourseOutline,
  useGenerateAllLessons,
  useListGeneratedLessons,
  useCancelJob,
  useGetJob,
  type CourseOutline,
  type OutlineSection,
} from '@/hooks/useAIGeneration';
import { useCreateCourse, useUpdateCourse } from '@/hooks/useCourses';

// Content transformation
import { generatedLessonsToCourseContent, toApiFormat } from '@/lib/contentTransform';

interface AIGenerationFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional course ID for editing an existing course */
  courseId?: string;
}

export function AIGenerationFlowModal({ isOpen, onClose, courseId: initialCourseId }: AIGenerationFlowModalProps) {
  const router = useRouter();

  // Track state for local polling and job management
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(initialCourseId || null);
  const [courseTitle, setCourseTitle] = useState<string>('');
  const selectedAudiencesRef = useRef<TargetAudienceTemplate[]>([]);
  const hasInitializedEdit = useRef(false);

  // Reset state when modal opens with a different course
  useEffect(() => {
    if (isOpen) {
      setCreatedCourseId(initialCourseId || null);
      if (!initialCourseId) {
        hasInitializedEdit.current = false;
      }
    } else {
      // Reset when modal closes
      hasInitializedEdit.current = false;
    }
  }, [isOpen, initialCourseId]);

  // Track whether state machine is controlling polling (to disable hook auto-polling)
  const [machineIsPolling, setMachineIsPolling] = useState(false);

  // Confirm close modal
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Fetch SMEs and Target Audiences
  const { data: smes = [], isLoading: smesLoading } = useListSMEs();
  const { data: audiences = [], isLoading: audiencesLoading } = useListTargetAudiences();

  // API mutation hooks
  const generateOutlineHook = useGenerateCourseOutline();
  const approveOutlineHook = useApproveCourseOutline();
  const rejectOutlineHook = useRejectCourseOutline();
  const generateAllLessonsHook = useGenerateAllLessons();
  const cancelJobHook = useCancelJob();
  const createCourseHook = useCreateCourse();
  const updateCourseHook = useUpdateCourse();

  // Job polling hook - disable auto-polling when machine is controlling the polling
  const { data: currentJob, refetch: refetchJob } = useGetJob(
    currentJobId || undefined,
    { refetchInterval: machineIsPolling ? false : undefined }
  );

  // Outline fetching based on course ID
  const { data: outline, refetch: refetchOutline } = useGetCourseOutline(createdCourseId || undefined);

  // Lessons fetching
  const { data: generatedLessons, refetch: refetchLessons } = useListGeneratedLessons(createdCourseId || undefined);

  // Use refs to avoid stale closure issues in actors
  // These refs always point to the latest functions from hooks
  const refetchJobRef = useRef(refetchJob);
  const refetchOutlineRef = useRef(refetchOutline);
  const refetchLessonsRef = useRef(refetchLessons);
  const generateOutlineRef = useRef(generateOutlineHook.mutate);
  const approveOutlineRef = useRef(approveOutlineHook.mutate);
  const rejectOutlineRef = useRef(rejectOutlineHook.mutate);
  const generateAllLessonsRef = useRef(generateAllLessonsHook.mutate);
  const setCurrentJobIdRef = useRef(setCurrentJobId);
  const outlineRef = useRef(outline);

  // Keep refs updated with latest functions
  useEffect(() => {
    refetchJobRef.current = refetchJob;
  }, [refetchJob]);

  useEffect(() => {
    refetchOutlineRef.current = refetchOutline;
  }, [refetchOutline]);

  useEffect(() => {
    refetchLessonsRef.current = refetchLessons;
  }, [refetchLessons]);

  useEffect(() => {
    generateOutlineRef.current = generateOutlineHook.mutate;
  }, [generateOutlineHook.mutate]);

  useEffect(() => {
    approveOutlineRef.current = approveOutlineHook.mutate;
  }, [approveOutlineHook.mutate]);

  useEffect(() => {
    rejectOutlineRef.current = rejectOutlineHook.mutate;
  }, [rejectOutlineHook.mutate]);

  useEffect(() => {
    generateAllLessonsRef.current = generateAllLessonsHook.mutate;
  }, [generateAllLessonsHook.mutate]);

  useEffect(() => {
    setCurrentJobIdRef.current = setCurrentJobId;
  }, []);

  useEffect(() => {
    outlineRef.current = outline;
  }, [outline]);

  // Configure machine with real actor implementations - memoized to prevent recreation
  // Empty dependency array ensures machine is created once and actors use refs for latest values
  const machineWithActors = useMemo(() => courseGenerationMachine.provide({
    actors: {
      generateOutlineActor: fromPromise(async ({ input }: { input: CourseGenerationInput }) => {
        console.log('[generateOutlineActor] Starting outline generation for course:', input.courseId);
        const result = await generateOutlineRef.current({
          courseId: input.courseId,
          smeIds: input.smeIds,
          targetAudienceIds: input.targetAudienceIds,
          desiredOutcome: input.desiredOutcome,
          additionalContext: input.additionalContext,
        });

        if (!result.job) {
          console.error('[generateOutlineActor] No job returned from outline generation');
          throw new Error('Failed to start outline generation - no job returned');
        }

        console.log('[generateOutlineActor] Job created:', result.job.id);
        setCurrentJobIdRef.current(result.job.id);
        return { job: result.job };
      }),
      pollJobActor: fromPromise(async ({ input }: { input: { jobId: string } }) => {
        console.log('[pollJobActor] Polling job:', input.jobId);

        // Wait a tick to ensure React has re-rendered with the new currentJobId
        // This prevents stale closure issues where the ref hasn't been updated yet
        await new Promise(resolve => setTimeout(resolve, 100));

        // Use ref to get the latest refetch function to avoid stale closures
        const result = await refetchJobRef.current();
        const freshJob = result.data?.job;

        if (!freshJob) {
          console.error('[pollJobActor] No job data returned from refetch, jobId:', input.jobId);
          throw new Error('Failed to fetch job status');
        }

        // Verify we got the right job (sanity check)
        if (freshJob.id !== input.jobId) {
          console.warn('[pollJobActor] Job ID mismatch, expected:', input.jobId, 'got:', freshJob.id);
        }

        console.log('[pollJobActor] Fresh status:', freshJob.status, 'progress:', freshJob.progressPercent);
        return { job: freshJob };
      }),
      getOutlineActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
        console.log('[getOutlineActor] Fetching outline for course:', input.courseId);

        // Wait a tick to ensure React has re-rendered with the latest state
        await new Promise(resolve => setTimeout(resolve, 100));

        // Use ref to get the latest refetch function to avoid stale closures
        const result = await refetchOutlineRef.current();
        const freshOutline = result.data?.outline;

        if (!freshOutline) {
          console.error('[getOutlineActor] No outline data returned from refetch, courseId:', input.courseId);
          throw new Error('Failed to fetch outline');
        }

        console.log('[getOutlineActor] Outline fetched with', freshOutline.sections?.length || 0, 'sections');
        return { outline: freshOutline };
      }),
      approveOutlineActor: fromPromise(async ({ input }: { input: { courseId: string; outlineId: string } }) => {
        const result = await approveOutlineRef.current(input.courseId, input.outlineId);
        return { outline: result.outline! };
      }),
      rejectOutlineActor: fromPromise(async ({ input }: { input: { courseId: string; outlineId: string; reason: string } }) => {
        const result = await rejectOutlineRef.current(input.courseId, input.outlineId, input.reason);
        return { outline: result.outline! };
      }),
      updateOutlineActor: fromPromise(async ({ input }: { input: { courseId: string; outlineId: string; sections: OutlineSection[] } }) => {
        // Note: updateOutline hook would be needed here - for now return current outline
        return { outline: outlineRef.current! };
      }),
      generateLessonsActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
        const result = await generateAllLessonsRef.current(input.courseId);
        if (result.job) {
          setCurrentJobIdRef.current(result.job.id);
        }
        return { job: result.job! };
      }),
      listLessonsActor: fromPromise(async ({ input }: { input: { courseId: string } }) => {
        console.log('[listLessonsActor] Fetching lessons for course:', input.courseId);
        // Use ref to get the latest refetch function to avoid stale closures
        const result = await refetchLessonsRef.current();
        const freshLessons = result.data?.lessons || [];

        console.log('[listLessonsActor] Fetched', freshLessons.length, 'lessons');
        return { lessons: freshLessons };
      }),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // Empty deps - actors use refs for latest values, machine should only be created once

  const [state, send] = useMachine(machineWithActors);

  // Get state value as string for easier comparisons
  const getStateValue = (): string => {
    if (typeof state.value === 'string') return state.value;
    if (typeof state.value === 'object') {
      const keys = Object.keys(state.value);
      return keys[0] || '';
    }
    return '';
  };

  const currentStateValue = getStateValue();
  const context = state.context as CourseGenerationContext;

  // When editing an existing course, check if there's an outline and skip to review
  useEffect(() => {
    if (
      isOpen &&
      initialCourseId &&
      outline &&
      !hasInitializedEdit.current &&
      currentStateValue === 'configure'
    ) {
      hasInitializedEdit.current = true;
      console.log('[AIGenerationFlowModal] Editing existing course with outline, skipping to review');

      // Set up the machine context for the existing course
      send({
        type: 'SET_INPUT',
        input: {
          courseId: initialCourseId,
          smeIds: [],
          targetAudienceIds: [],
          desiredOutcome: '',
        },
      });

      // Trigger outline generated event to jump to review state
      send({ type: 'OUTLINE_GENERATED', outline });
    }
  }, [isOpen, initialCourseId, outline, currentStateValue, send]);

  // Update machineIsPolling when state changes
  // When in these states, the state machine controls polling - disable hook auto-polling
  useEffect(() => {
    const pollingStates = ['generatingOutline', 'generatingLessons'];
    const isPollingState = pollingStates.includes(currentStateValue);
    setMachineIsPolling(isPollingState);

    if (isPollingState) {
      console.log('[AIGenerationFlowModal] Machine is now controlling polling in state:', currentStateValue);
    }
  }, [currentStateValue]);

  // Handle wizard completion - create course and start generation
  const handleStartGeneration = useCallback(
    async (input: CourseGenerationInput & { categoryTags?: string[]; destinationFolder?: string }) => {
      try {
        // First create the course with folder and tags from wizard
        const result = await createCourseHook.mutate({
          settings: {
            title: courseTitle || 'AI Generated Course',
            desiredOutcome: input.desiredOutcome,
            dataSource: 'ai-generated',
            destinationFolder: input.destinationFolder,
            categoryTags: input.categoryTags,
          },
        });

        if (result.course) {
          const courseId = result.course.id;
          setCreatedCourseId(courseId);

          // Store selected audiences for later persona conversion
          const selectedAudiences = audiences.filter((a) =>
            input.targetAudienceIds.includes(a.id)
          );
          selectedAudiencesRef.current = selectedAudiences;

          // Update input with real course ID and send to machine
          const inputWithCourseId: CourseGenerationInput = {
            ...input,
            courseId,
          };

          send({ type: 'SET_INPUT', input: inputWithCourseId });
          send({ type: 'START_GENERATION' });
        }
      } catch (error) {
        console.error('Failed to create course:', error);
      }
    },
    [createCourseHook, send, courseTitle, audiences]
  );

  // Handle outline approval
  const handleApproveOutline = useCallback(() => {
    send({ type: 'APPROVE_OUTLINE' });
  }, [send]);

  // Handle outline rejection
  const handleRejectOutline = useCallback(
    (reason: string) => {
      send({ type: 'REJECT_OUTLINE', reason });
    },
    [send]
  );

  // Handle outline update
  const handleUpdateOutline = useCallback(
    (sections: OutlineSection[]) => {
      send({ type: 'UPDATE_OUTLINE', sections });
    },
    [send]
  );

  // Handle outline regeneration
  const handleRegenerateOutline = useCallback(() => {
    send({ type: 'REGENERATE_OUTLINE' });
  }, [send]);

  // Handle cancel during generation
  const handleCancel = useCallback(async () => {
    if (currentJobId) {
      try {
        await cancelJobHook.mutate(currentJobId);
      } catch (error) {
        console.error('Failed to cancel job:', error);
      }
    }
    send({ type: 'CANCEL' });
  }, [currentJobId, cancelJobHook, send]);

  // Handle retry after failure
  const handleRetry = useCallback(() => {
    send({ type: 'RETRY' });
  }, [send]);

  // Handle user choosing to wait for completion
  const handleWaitForCompletion = useCallback(() => {
    send({ type: 'WAIT_FOR_COMPLETION' });
  }, [send]);

  // Handle user choosing to navigate away
  const handleNavigateAway = useCallback(() => {
    send({ type: 'NAVIGATE_AWAY' });
    // Close modal and let user continue with their work
    onClose();
  }, [send, onClose]);

  // Handle completion - transform content, convert personas, and redirect
  useEffect(() => {
    if (currentStateValue === 'complete' && createdCourseId && generatedLessons && context.outline) {
      const transformAndSave = async () => {
        try {
          // Transform AI-generated lessons to CourseEditor format
          const { sections, courseBlocks } = generatedLessonsToCourseContent(
            generatedLessons,
            context.outline as CourseOutline
          );

          // Convert to API format (numeric block types)
          const apiContent = toApiFormat({ sections, courseBlocks });

          // Convert personas from audiences
          const personas = selectedAudiencesRef.current.map((audience) => ({
            id: `persona-${audience.id}`,
            name: audience.name,
            role: audience.role || audience.name,
            kpis: audience.learningGoals?.join(', ') || '',
            responsibilities: audience.typicalBackground || '',
            challenges: audience.challenges?.join(', ') || '',
          }));

          // Update course with transformed content and personas
          await updateCourseHook.mutate(createdCourseId, {
            content: apiContent,
            personas,
          });

          // Redirect to course editor (step 4) after a short delay
          setTimeout(() => {
            router.push(`/course-builder?id=${createdCourseId}&step=4`);
            onClose();
          }, 1500);
        } catch (error) {
          console.error('Failed to transform and save course content:', error);
          // Still redirect even on error - content can be edited manually
          setTimeout(() => {
            router.push(`/course-builder?id=${createdCourseId}&step=4`);
            onClose();
          }, 1500);
        }
      };

      transformAndSave();
    }
  }, [currentStateValue, createdCourseId, generatedLessons, context.outline, updateCourseHook, router, onClose]);

  // Handle close with confirmation if generating
  const handleCloseRequest = useCallback(() => {
    const isGenerating =
      currentStateValue === 'generatingOutline' ||
      currentStateValue === 'generatingLessons' ||
      currentStateValue === 'jobQueued';
    if (isGenerating) {
      setShowCloseConfirm(true);
    } else {
      // Reset machine and close
      send({ type: 'RESET' });
      setCreatedCourseId(null);
      setCurrentJobId(null);
      setCourseTitle('');
      onClose();
    }
  }, [currentStateValue, send, onClose]);

  const handleConfirmClose = useCallback(() => {
    if (currentJobId) {
      cancelJobHook.mutate(currentJobId).catch(console.error);
    }
    send({ type: 'RESET' });
    setCreatedCourseId(null);
    setCurrentJobId(null);
    setCourseTitle('');
    setShowCloseConfirm(false);
    onClose();
  }, [currentJobId, cancelJobHook, send, onClose]);

  if (!isOpen) return null;

  const isLoading = smesLoading || audiencesLoading;

  // Render based on machine state
  const renderContent = () => {
    // Loading state
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading resources...</p>
          </div>
        </div>
      );
    }

    // No SMEs available
    if (smes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Subject Matter Experts</h3>
          <p className="text-gray-500 mb-6 max-w-md">
            You need to create at least one SME with knowledge content before generating a course.
            SMEs provide the source material for AI course generation.
          </p>
          <button
            onClick={() => {
              onClose();
              router.push('/smes');
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Create an SME
          </button>
        </div>
      );
    }

    // No Target Audiences
    if (audiences.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Target Audiences</h3>
          <p className="text-gray-500 mb-6 max-w-md">
            You need to define at least one target audience profile before generating a course.
            Target audiences help tailor the content to your learners.
          </p>
          <button
            onClick={() => {
              onClose();
              router.push('/target-audiences');
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Create a Target Audience
          </button>
        </div>
      );
    }

    // State-based rendering
    switch (currentStateValue) {
      case 'configure':
        return (
          <AIGenerationWizard
            courseId={createdCourseId || 'pending'}
            courseName={courseTitle || 'New AI Course'}
            availableSmes={smes as SubjectMatterExpert[]}
            availableAudiences={audiences as TargetAudienceTemplate[]}
            onStartGeneration={handleStartGeneration}
            onCancel={handleCloseRequest}
            isLoading={createCourseHook.isLoading}
          />
        );

      case 'generatingOutline':
        return (
          <GenerationProgressPanel
            currentStep={context.currentStep}
            progressPercent={context.progressPercent}
            progressMessage={context.progressMessage}
            job={context.outlineJob}
            onCancel={handleCancel}
            onContinueInBackground={handleNavigateAway}
            error={context.error ? { message: context.error.message } : null}
            onRetry={handleRetry}
          />
        );

      case 'jobQueued':
        return (
          <GenerationQueuedConfirmation
            totalLessons={context.totalLessons}
            jobId={context.lessonJob?.id || 'pending'}
            courseTitle={courseTitle}
            onWaitForCompletion={handleWaitForCompletion}
            onNavigateAway={handleNavigateAway}
          />
        );

      case 'generatingLessons':
        return (
          <GenerationProgressPanel
            currentStep={context.currentStep}
            progressPercent={context.progressPercent}
            progressMessage={context.progressMessage}
            job={context.lessonJob}
            onCancel={handleCancel}
            onContinueInBackground={handleNavigateAway}
            error={context.error ? { message: context.error.message } : null}
            onRetry={handleRetry}
          />
        );

      case 'reviewOutline':
        if (!context.outline) {
          return (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading outline...</p>
              </div>
            </div>
          );
        }
        return (
          <OutlineReviewPanel
            outline={context.outline as CourseOutline}
            onApprove={handleApproveOutline}
            onReject={handleRejectOutline}
            onUpdate={handleUpdateOutline}
            onRegenerate={handleRegenerateOutline}
            isApproving={approveOutlineHook.isLoading}
          />
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Course Generated!</h3>
            <p className="text-gray-600 mb-4">
              Your AI-powered course has been created with {generatedLessons?.length || 0} lessons.
            </p>
            <p className="text-sm text-gray-500">Redirecting to course editor...</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Generate Course with AI</h1>
          <p className="text-sm text-gray-500">
            Create a complete course from your SME knowledge
          </p>
        </div>
        <button
          onClick={handleCloseRequest}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">{renderContent()}</div>
      </div>

      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">Cancel Generation?</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600">
                AI generation is currently in progress. Are you sure you want to cancel?
                Any progress will be lost.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Continue Generation
              </button>
              <button
                onClick={handleConfirmClose}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Cancel & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
