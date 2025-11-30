'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Clock, FileText, CheckCircle, Edit2, Trash2, X, PartyPopper } from 'lucide-react';
import CourseCreationModal from '@/components/dashboard/CourseCreationModal';
import { useGetCoursesQuery, useDeleteCourseMutation, type LibraryEntry } from '@/store/api/apiSlice';
import { useRouter, useSearchParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import * as courseClient from '@/lib/courseClient';

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'draft' | 'published'>('recent');
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Confetti celebration function
  const fireConfetti = useCallback(() => {
    // Multicolored confetti burst - less particles, shorter duration
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

    // Single burst from center-top
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { x: 0.5, y: 0.3 },
      colors: colors,
      ticks: 200,
      gravity: 1.2,
      scalar: 1.2,
    });

    // Delayed side bursts
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

  // Handle checkout success and welcome banners (auth_token handled by layout)
  useEffect(() => {
    const isCheckoutSuccess = searchParams.get('checkout') === 'success';
    const isWelcome = searchParams.get('welcome') === 'true';

    if (isCheckoutSuccess) {
      setShowSuccessBanner(true);
      fireConfetti();
      // Clean up URL
      router.replace('/dashboard', { scroll: false });
    }

    if (isWelcome) {
      setShowWelcomeModal(true);
      fireConfetti();
      // Clean up URL
      router.replace('/dashboard', { scroll: false });
    }
  }, [searchParams, router, fireConfetti]);

  // Auto-hide success banner after 30 seconds
  useEffect(() => {
    if (showSuccessBanner) {
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessBanner]);

  // RTK Query - automatically fetches and caches
  const { data: courses = [], isLoading } = useGetCoursesQuery();
  const [deleteCourse] = useDeleteCourseMutation();

  // Filter courses based on active tab - handle undefined courses array
  const filteredCourses = (courses || []).filter((course: LibraryEntry) => {
    if (activeTab === 'draft') return course.status === 'draft';
    if (activeTab === 'published') return course.status === 'published';
    // For 'recent', show all courses sorted by date (handled by API)
    return true;
  });

  const handleEditCourse = async (courseId: string) => {
    try {
      // Load the course data to check if it has generated content
      const course = await courseClient.getCourse(courseId);

      // If course has content (sections or courseBlocks), go directly to editor
      // Otherwise, go to the course builder wizard
      const sections = course?.content?.sections || [];
      const courseBlocks = course?.content?.courseBlocks || [];
      if (sections.length > 0 || courseBlocks.length > 0) {
        // Course has been generated, go directly to editor
        router.push(`/course-builder?id=${courseId}&step=4`);
      } else {
        // Course is still in draft/setup phase, go to wizard
        router.push(`/course-builder?id=${courseId}`);
      }
    } catch (error) {
      // Fallback to wizard if we can't load the course
      router.push(`/course-builder?id=${courseId}`);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    // Use a more detailed confirmation message
    const confirmMessage = 'Are you sure you want to delete this course?\n\nThis action cannot be undone and will permanently remove the course and all its content.';

    if (confirm(confirmMessage)) {
      try {
        // Delete the course - connect-query automatically refetches via query invalidation
        await deleteCourse(courseId);
      } catch (error) {
        console.error('Failed to delete course:', error);
        alert('Failed to delete course. Please try again.');
      }
    }
  };

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
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center">
            <div className="bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <PartyPopper className="w-10 h-10 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to the Team!</h2>
            <p className="text-gray-600 mb-6">
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

      {/* Something New Section - Updates/News */}
      <div className="bg-gray-200 rounded-2xl p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900">Something New Foo!</h2>
      </div>

      {/* Hero Section with Create Button */}
      <div className="bg-gradient-to-r from-primary-100 to-primary-50 rounded-2xl p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Your Dashboard</h2>
            <p className="text-gray-600">Create engaging courses with AI or import existing materials</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-lg hover:shadow-xl"
          >
            <Plus className="w-5 h-5" />
            Create Course
          </button>
        </div>
      </div>

      {/* Course Creation Modal */}
      <CourseCreationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Your Courses Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {/* Header with responsive layout */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Your Courses</h3>
          {/* Tab buttons - horizontal scroll on mobile */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
            <button
              onClick={() => setActiveTab('recent')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap min-h-[44px] ${
                activeTab === 'recent'
                  ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setActiveTab('draft')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap min-h-[44px] ${
                activeTab === 'draft'
                  ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Drafts
            </button>
            <button
              onClick={() => setActiveTab('published')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap min-h-[44px] ${
                activeTab === 'published'
                  ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Published
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="min-h-[300px] flex items-center justify-center">
            <div className="text-gray-500">Loading courses...</div>
          </div>
        ) : filteredCourses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCourses.map((course: LibraryEntry) => (
              <div
                key={course.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-base font-medium text-gray-900 line-clamp-2">
                    {course.title || 'Untitled Course'}
                  </h4>
                  <div className="flex gap-1 -mr-2">
                    <button
                      onClick={() => handleEditCourse(course.id)}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit course"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCourse(course.id)}
                      className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete course"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs mt-3">
                  <div className="flex items-center gap-1">
                    {course.status === 'published' ? (
                      <>
                        <CheckCircle className="w-3 h-3 text-green-600" />
                        <span className="text-green-600">Published</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3 h-3 text-gray-500" />
                        <span className="text-gray-500">Draft</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(course.modifiedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {course.tags && course.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {course.tags.slice(0, 3).map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
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
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              {activeTab === 'draft' && 'No draft courses'}
              {activeTab === 'published' && 'No published courses'}
              {activeTab === 'recent' && 'No courses yet'}
            </h4>
            <p className="text-gray-500 mb-6 max-w-sm">
              Get started by creating your first course using AI prompts or importing existing materials
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
            >
              Create your first course
            </button>
          </div>
        )}
      </div>
    </>
  );
}

