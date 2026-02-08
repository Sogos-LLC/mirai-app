'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Clock, FileText, CheckCircle, Edit2, Trash2, X, PartyPopper, Loader2, PauseCircle, ArrowRight } from 'lucide-react';
import { useListCourses, useDeleteCourse, type LibraryEntry } from '@/hooks/useCourses';
import { CourseStatus } from '@/gen/mirai/v1/course_pb';
import { GenerationJobStatus, type GenerationJob } from '@/gen/mirai/v1/ai_generation_types_pb';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInProgressJobs } from '@/hooks/useActiveCourseCreation';
import { useDeleteJob } from '@/hooks/ai-generation/useJobs';
import { GapTaskList } from '@/components/dashboard/GapTaskList';

type TabType = 'recent' | 'in_progress' | 'draft' | 'published';

function getJobStatusDisplay(status: GenerationJobStatus) {
  switch (status) {
    case GenerationJobStatus.PROCESSING:
      return { label: 'Generating...', icon: Loader2, iconClass: 'animate-spin text-indigo-500 dark:text-indigo-400' };
    case GenerationJobStatus.AWAITING_APPROVAL:
      return { label: 'Awaiting Review', icon: Clock, iconClass: 'text-amber-500 dark:text-amber-400' };
    case GenerationJobStatus.DEFERRED:
      return { label: 'Waiting for Gap Tasks', icon: PauseCircle, iconClass: 'text-blue-500 dark:text-blue-400' };
    case GenerationJobStatus.CANCELLED:
      return { label: 'Cancelled', icon: X, iconClass: 'text-gray-500 dark:text-gray-400' };
    default:
      return { label: 'In Progress', icon: Loader2, iconClass: 'animate-spin text-indigo-500 dark:text-indigo-400' };
  }
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('recent');
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showGapsAssignedBanner, setShowGapsAssignedBanner] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Confetti celebration function - lazy loads canvas-confetti only when needed
  const fireConfetti = useCallback(async () => {
    const { default: confetti } = await import('canvas-confetti');
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

    confetti({
      particleCount: 80,
      spread: 100,
      origin: { x: 0.5, y: 0.3 },
      colors: colors,
      ticks: 200,
      gravity: 1.2,
      scalar: 1.2,
    });

    setTimeout(() => {
      confetti({
        particleCount: 30,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.6 },
        colors: colors,
      });
      confetti({
        particleCount: 30,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.6 },
        colors: colors,
      });
    }, 200);
  }, []);

  // Handle checkout success, welcome banners, gaps assigned (auth_token handled by layout)
  useEffect(() => {
    const isCheckoutSuccess = searchParams.get('checkout') === 'success';
    const isWelcome = searchParams.get('welcome') === 'true';
    const isGapsAssigned = searchParams.get('gaps_assigned') === 'true';

    if (isCheckoutSuccess) {
      setShowSuccessBanner(true);
      fireConfetti();
      router.replace('/dashboard', { scroll: false });
    }

    if (isWelcome) {
      setShowWelcomeModal(true);
      fireConfetti();
      router.replace('/dashboard', { scroll: false });
    }

    if (isGapsAssigned) {
      setShowGapsAssignedBanner(true);
      router.replace('/dashboard', { scroll: false });
    }
  }, [searchParams, router, fireConfetti]);

  // Auto-hide success banner after 30 seconds
  useEffect(() => {
    if (showSuccessBanner) {
      const timer = setTimeout(() => setShowSuccessBanner(false), 30000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessBanner]);

  // Auto-hide gaps assigned banner after 10 seconds
  useEffect(() => {
    if (showGapsAssignedBanner) {
      const timer = setTimeout(() => setShowGapsAssignedBanner(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [showGapsAssignedBanner]);

  // Server-side filtering based on active tab (only for course tabs)
  const statusFilter = activeTab === 'draft'
    ? CourseStatus.DRAFT
    : activeTab === 'published'
      ? CourseStatus.PUBLISHED
      : undefined;

  const { data: courses, isLoading, isFetching } = useListCourses({
    status: statusFilter,
  });
  const deleteCourseMutation = useDeleteCourse();
  const { inProgressJobs, inProgressCount } = useInProgressJobs();
  const deleteJobHook = useDeleteJob();

  // Exclude courses that have in-progress jobs from course tabs (Recent/Drafts/Published)
  const inProgressCourseIds = new Set(
    inProgressJobs
      .filter((j) => j.courseId)
      .map((j) => j.courseId)
  );
  const filteredCourses = (courses || []).filter(
    (course: LibraryEntry) => !inProgressCourseIds.has(course.id)
  );

  const handleEditCourse = (courseId: string) => {
    router.push(`/course/${courseId}/editor`);
  };

  const handleDeleteCourse = async (courseId: string) => {
    const confirmMessage = 'Are you sure you want to delete this course?\n\nThis action cannot be undone and will permanently remove the course and all its content.';

    if (confirm(confirmMessage)) {
      try {
        await deleteCourseMutation.mutate(courseId);
      } catch (error) {
        console.error('Failed to delete course:', error);
        alert('Failed to delete course. Please try again.');
      }
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?\n\nThis will cancel any active workflow and permanently remove the job.')) return;
    setDeletingJobId(jobId);
    try {
      await deleteJobHook.mutate(jobId);
    } catch {
      // Error handled by hook
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleResumeJob = (job: GenerationJob) => {
    router.push(`/course/wizard?jobId=${job.id}`);
  };

  // Tab configuration
  const tabs: { key: TabType; label: string; badge?: number }[] = [
    { key: 'recent', label: 'Recent' },
    { key: 'in_progress', label: 'In Progress', badge: inProgressCount > 0 ? inProgressCount : undefined },
    { key: 'draft', label: 'Drafts' },
    { key: 'published', label: 'Published' },
  ];

  return (
    <>
      {/* Welcome Modal for Invited Users */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowWelcomeModal(false)}
          />
          {/* Modal */}
          <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-2xl dark:shadow-glow-md max-w-md w-full mx-4 p-8 text-center border border-transparent dark:border-dark-border">
            <div className="bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <PartyPopper className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to the Team!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Your account has been created and you&apos;re now part of the team.
              Let&apos;s get started!
            </p>
            <button
              onClick={() => setShowWelcomeModal(false)}
              className="w-full py-3 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Checkout Success Banner */}
      {showSuccessBanner && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-6 mb-8 relative overflow-hidden">
          <button
            onClick={() => setShowSuccessBanner(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            <div className="bg-white/20 rounded-full p-3">
              <PartyPopper className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Payment Successful!</h2>
              <p className="text-white/90">Your subscription is now active. Start creating amazing courses!</p>
            </div>
          </div>
        </div>
      )}

      {/* Gaps Assigned Success Banner */}
      {showGapsAssignedBanner && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-5 mb-6 relative">
          <button
            onClick={() => setShowGapsAssignedBanner(false)}
            className="absolute top-3 right-3 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-full p-2">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Knowledge gaps assigned!</h3>
              <p className="text-sm text-white/90">
                Team members have been notified. Your course is saved as a draft and can be resumed once gaps are filled.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section with Create Button */}
      <div className="bg-gradient-to-r from-primary-100 to-primary-50 dark:from-primary-900/30 dark:to-primary-800/20 rounded-2xl p-8 mb-8 border border-transparent dark:border-dark-border">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to Your Dashboard</h2>
            <p className="text-gray-600 dark:text-gray-400">Create engaging courses with AI or import existing materials</p>
          </div>
          <button
            onClick={() => router.push('/course/wizard')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-medium shadow-lg hover:shadow-xl"
          >
            <Plus className="w-5 h-5" />
            Create Course
          </button>
        </div>
      </div>

      {/* Assigned Gap Tasks */}
      <GapTaskList />

      {/* Your Courses Section */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border p-6">
        {/* Header with responsive layout */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Your Courses</h3>
            {isFetching && !isLoading && activeTab !== 'in_progress' && (
              <div className="w-4 h-4 border-2 border-primary-200 dark:border-primary-800 border-t-primary-600 dark:border-t-primary-400 rounded-full animate-spin" />
            )}
          </div>
          {/* Tab buttons - horizontal scroll on mobile */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap min-h-[44px] flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/40'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-50'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'in_progress' ? (
          /* In Progress tab content */
          inProgressJobs.length > 0 ? (
            <div className="flex flex-col gap-3">
              {inProgressJobs.map((job) => {
                const status = getJobStatusDisplay(job.status);
                const StatusIcon = status.icon;
                const isDeleting = deletingJobId === job.id;
                const isCancelled = job.status === GenerationJobStatus.CANCELLED;

                return (
                  <div
                    key={job.id}
                    className="border border-gray-200 dark:border-dark-border rounded-lg p-4 bg-white dark:bg-dark-50"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="shrink-0 mt-0.5">
                          <StatusIcon className={`w-5 h-5 ${status.iconClass}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              Course Creation
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isCancelled
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                            }`}>
                              {status.label}
                            </span>
                          </div>
                          {!isCancelled && (
                            <>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                                {job.progressMessage || 'Processing...'}
                              </p>
                              <div className="mt-2 w-full max-w-xs">
                                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all duration-500"
                                    style={{ width: `${job.progressPercent}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 inline-block">
                                  {job.progressPercent}%
                                </span>
                              </div>
                            </>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Started {job.createdAt
                              ? new Date(Number(job.createdAt.seconds) * 1000).toLocaleDateString()
                              : 'Unknown'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isCancelled && (
                          <button
                            onClick={() => handleResumeJob(job)}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors min-h-[44px]"
                          >
                            Resume
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          disabled={isDeleting}
                          className="flex items-center justify-center p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors min-h-[44px] min-w-[44px] disabled:opacity-50"
                          title="Delete"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="min-h-[300px] flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-dark-50 rounded-full flex items-center justify-center mb-4">
                <Loader2 className="w-10 h-10 text-gray-400 dark:text-gray-500" />
              </div>
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No jobs in progress
              </h4>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                Start creating a course and it will appear here while generating
              </p>
              <button
                onClick={() => router.push('/course/wizard')}
                className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
              >
                Create a course
              </button>
            </div>
          )
        ) : (
          /* Course list tabs (recent, draft, published) */
          isLoading ? (
            <div className="min-h-[300px] flex items-center justify-center">
              <div className="text-gray-500 dark:text-gray-400">Loading courses...</div>
            </div>
          ) : filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCourses.map((course: LibraryEntry) => (
                <div
                  key={course.id}
                  className="border border-gray-200 dark:border-dark-border rounded-lg p-4 hover:shadow-md dark:hover:shadow-glow-sm transition-shadow bg-white dark:bg-dark-50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white line-clamp-2">
                      {course.title || 'Untitled Course'}
                    </h4>
                    <div className="flex gap-1 -mr-2">
                      <button
                        onClick={() => handleEditCourse(course.id)}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-dark-50 rounded-lg transition-colors"
                        title="Edit course"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCourse(course.id)}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete course"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs mt-3">
                    <div className="flex items-center gap-1">
                      {course.status === CourseStatus.PUBLISHED ? (
                        <>
                          <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span className="text-green-600 dark:text-green-400">Published</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                          <span className="text-gray-500 dark:text-gray-400">Draft</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>
                        {course.modifiedAt
                          ? new Date(Number(course.modifiedAt.seconds) * 1000).toLocaleDateString()
                          : 'Unknown'}
                      </span>
                    </div>
                  </div>

                  {course.tags && course.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {course.tags.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-gray-100 dark:bg-dark-50 text-gray-600 dark:text-gray-400 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="min-h-[300px] flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-dark-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {activeTab === 'draft' && 'No draft courses'}
                {activeTab === 'published' && 'No published courses'}
                {activeTab === 'recent' && 'No courses yet'}
              </h4>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                Get started by creating your first course using AI prompts or importing existing materials
              </p>
              <button
                onClick={() => router.push('/course/wizard')}
                className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
              >
                Create your first course
              </button>
            </div>
          )
        )}
      </div>
    </>
  );
}
