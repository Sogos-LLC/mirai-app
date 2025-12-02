'use client';

import { useState } from 'react';
import type { CourseOutline, OutlineSection, OutlineLesson } from '@/gen/mirai/v1/ai_generation_pb';
import { OutlineEditor } from './OutlineEditor';

// Approval status constants from proto
const APPROVAL_STATUS = {
  UNSPECIFIED: 0,
  PENDING_REVIEW: 1,
  APPROVED: 2,
  REJECTED: 3,
  REVISION_REQUESTED: 4,
} as const;

interface OutlineReviewPanelProps {
  outline: CourseOutline;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onUpdate: (sections: OutlineSection[]) => void;
  onRegenerate: () => void;
  isUpdating?: boolean;
  isApproving?: boolean;
}

export function OutlineReviewPanel({
  outline,
  onApprove,
  onReject,
  onUpdate,
  onRegenerate,
  isUpdating = false,
  isApproving = false,
}: OutlineReviewPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSections, setEditedSections] = useState<OutlineSection[]>(outline.sections);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const totalLessons = outline.sections.reduce((sum, section) => sum + section.lessons.length, 0);
  const totalDuration = outline.sections.reduce(
    (sum, section) =>
      sum + section.lessons.reduce((lessonSum, lesson) => lessonSum + lesson.estimatedDurationMinutes, 0),
    0
  );

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(outline.sections.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const handleSaveEdits = () => {
    onUpdate(editedSections);
    setIsEditing(false);
  };

  const handleCancelEdits = () => {
    setEditedSections(outline.sections);
    setIsEditing(false);
  };

  const handleReject = () => {
    if (rejectReason.trim()) {
      onReject(rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
    }
  };

  const getApprovalStatusBadge = () => {
    switch (outline.approvalStatus) {
      case APPROVAL_STATUS.PENDING_REVIEW:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Pending Review
          </span>
        );
      case APPROVAL_STATUS.APPROVED:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Approved
          </span>
        );
      case APPROVAL_STATUS.REJECTED:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Rejected
          </span>
        );
      case APPROVAL_STATUS.REVISION_REQUESTED:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            Revision Requested
          </span>
        );
      default:
        return null;
    }
  };

  const sectionsToDisplay = isEditing ? editedSections : outline.sections;

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Course Outline</h2>
            <p className="text-indigo-100 text-sm mt-1">Review the AI-generated structure</p>
          </div>
          {getApprovalStatusBadge()}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="text-gray-600">{outline.sections.length} sections</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-gray-600">{totalLessons} lessons</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-gray-600">~{totalDuration} min total</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Expand All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Outline Content */}
      <div className="p-6 max-h-[500px] overflow-y-auto">
        {isEditing ? (
          <OutlineEditor
            sections={editedSections}
            onChange={setEditedSections}
          />
        ) : (
          <div className="space-y-4">
            {sectionsToDisplay.map((section, sectionIndex) => {
              const isExpanded = expandedSections.has(section.id);

              return (
                <div key={section.id} className="border rounded-lg overflow-hidden">
                  {/* Section Header */}
                  <div
                    className={`
                      flex items-center justify-between p-4 cursor-pointer
                      ${isExpanded ? 'bg-indigo-50 border-b' : 'bg-gray-50 hover:bg-gray-100'}
                    `}
                    onClick={() => toggleSection(section.id)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-medium">
                        {sectionIndex + 1}
                      </span>
                      <div>
                        <h3 className="font-medium text-gray-900">{section.title}</h3>
                        <p className="text-sm text-gray-500">{section.lessons.length} lessons</p>
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Lessons List */}
                  {isExpanded && (
                    <div className="divide-y divide-gray-100">
                      {section.lessons.map((lesson, lessonIndex) => (
                        <div key={lesson.id} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center">
                              {sectionIndex + 1}.{lessonIndex + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900">{lesson.title}</h4>
                              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{lesson.description}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="inline-flex items-center text-xs text-gray-400">
                                  <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {lesson.estimatedDurationMinutes} min
                                </span>
                                {lesson.learningObjectives.length > 0 && (
                                  <span className="inline-flex items-center text-xs text-gray-400">
                                    <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {lesson.learningObjectives.length} objectives
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t">
        {isEditing ? (
          <div className="flex justify-end gap-3">
            <button
              onClick={handleCancelEdits}
              disabled={isUpdating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdits}
              disabled={isUpdating}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isUpdating ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        ) : (
          <div className="flex justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Edit Outline
              </button>
              <button
                onClick={onRegenerate}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Regenerate
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50"
              >
                Reject
              </button>
              <button
                onClick={onApprove}
                disabled={isApproving}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isApproving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Approving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Approve & Generate Content
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">Reject Outline</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">
                Please provide feedback on why this outline should be rejected.
                The AI will use this to generate a better outline.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                rows={4}
                placeholder="What should be different? What's missing or incorrect?"
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject & Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
