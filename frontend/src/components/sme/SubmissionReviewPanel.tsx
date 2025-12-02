'use client';

import { useState, useEffect } from 'react';
import type { SMETask, SMETaskSubmission } from '@/gen/mirai/v1/sme_pb';
import { ContentType, EnhanceType } from '@/gen/mirai/v1/sme_pb';
import {
  useListSubmissions,
  useApproveSubmission,
  useRequestSubmissionChanges,
  useEnhanceSubmissionContent,
} from '@/hooks/useSME';

interface SubmissionReviewPanelProps {
  task: SMETask;
  smeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const CONTENT_TYPE_LABELS: Record<number, string> = {
  0: 'Any',
  1: 'Document',
  2: 'Image',
  3: 'Video',
  4: 'Audio',
  5: 'URL',
  6: 'Text',
};

export function SubmissionReviewPanel({
  task,
  smeName,
  onClose,
  onSuccess,
}: SubmissionReviewPanelProps) {
  const [editedContent, setEditedContent] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Fetch submissions for this task
  const { data: submissions, isLoading: isLoadingSubmissions } = useListSubmissions(task.id);

  // Mutations
  const approveSubmission = useApproveSubmission();
  const requestChanges = useRequestSubmissionChanges();
  const enhanceContent = useEnhanceSubmissionContent();

  // Get the latest submission (most recent)
  const latestSubmission = submissions.length > 0
    ? submissions.sort((a, b) => {
        const aTime = a.submittedAt ? Number(a.submittedAt.seconds) : 0;
        const bTime = b.submittedAt ? Number(b.submittedAt.seconds) : 0;
        return bTime - aTime;
      })[0]
    : null;

  // Initialize edited content when submission loads
  useEffect(() => {
    if (latestSubmission?.extractedText) {
      setEditedContent(latestSubmission.extractedText);
    }
  }, [latestSubmission?.extractedText]);

  const isTextContent = latestSubmission?.contentType === ContentType.TEXT;

  const handleSummarize = async () => {
    if (!latestSubmission) return;
    setIsEnhancing(true);
    try {
      const result = await enhanceContent.mutate({
        submissionId: latestSubmission.id,
        enhanceType: EnhanceType.SUMMARIZE,
      });
      if (result.enhancedContent) {
        setEditedContent(result.enhancedContent);
      }
    } catch (err) {
      console.error('Failed to summarize content:', err);
      alert('Failed to summarize content. Please try again.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleImprove = async () => {
    if (!latestSubmission) return;
    setIsEnhancing(true);
    try {
      const result = await enhanceContent.mutate({
        submissionId: latestSubmission.id,
        enhanceType: EnhanceType.IMPROVE,
      });
      if (result.enhancedContent) {
        setEditedContent(result.enhancedContent);
      }
    } catch (err) {
      console.error('Failed to improve content:', err);
      alert('Failed to improve content. Please try again.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleApprove = async () => {
    if (!latestSubmission) return;
    try {
      await approveSubmission.mutate({
        submissionId: latestSubmission.id,
        approvedContent: editedContent,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to approve submission:', err);
      alert('Failed to approve submission. Please try again.');
    }
  };

  const handleRequestChanges = async () => {
    if (!latestSubmission || !feedback.trim()) return;
    try {
      await requestChanges.mutate({
        submissionId: latestSubmission.id,
        feedback: feedback.trim(),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to request changes:', err);
      alert('Failed to request changes. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Review Submission</h2>
              <p className="text-sm text-gray-500 mt-1">
                {task.title} • {smeName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {isLoadingSubmissions ? (
            <div className="flex justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : !latestSubmission ? (
            <div className="text-center py-8 text-gray-500">
              <p>No submission found for this task.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Submission Info */}
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {CONTENT_TYPE_LABELS[latestSubmission.contentType] || 'Unknown'}
                </span>
                {latestSubmission.submittedAt && (
                  <span className="text-gray-500">
                    Submitted: {new Date(Number(latestSubmission.submittedAt.seconds) * 1000).toLocaleString()}
                  </span>
                )}
              </div>

              {/* AI Enhancement Buttons - Only for TEXT content */}
              {isTextContent && (
                <div className="flex gap-2 pb-2 border-b border-gray-200">
                  <button
                    onClick={handleSummarize}
                    disabled={isEnhancing || approveSubmission.isLoading}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-md hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEnhancing ? (
                      <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    Summarize
                  </button>
                  <button
                    onClick={handleImprove}
                    disabled={isEnhancing || approveSubmission.isLoading}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEnhancing ? (
                      <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                    Improve
                  </button>
                </div>
              )}

              {/* Content Editor - Only for TEXT content */}
              {isTextContent ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Submitted Content
                  </label>
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    disabled={isEnhancing || approveSubmission.isLoading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    You can edit the content before approving. Changes will be saved as the approved version.
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">
                    Non-text submissions (files, images, etc.) will be reviewed in a future update.
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    File: {latestSubmission.fileName}
                  </p>
                </div>
              )}

              {/* Previous Feedback (if any) */}
              {latestSubmission.reviewerNotes && (
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <h4 className="text-sm font-medium text-orange-800 mb-1">Previous Feedback</h4>
                  <p className="text-sm text-orange-700">{latestSubmission.reviewerNotes}</p>
                </div>
              )}

              {/* Request Changes Form */}
              {showFeedbackForm && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Feedback for submitter
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Explain what changes are needed..."
                    className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 text-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {latestSubmission && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>

              {showFeedbackForm ? (
                <>
                  <button
                    onClick={() => {
                      setShowFeedbackForm(false);
                      setFeedback('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleRequestChanges}
                    disabled={!feedback.trim() || requestChanges.isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requestChanges.isLoading ? 'Sending...' : 'Send Feedback'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowFeedbackForm(true)}
                    disabled={approveSubmission.isLoading}
                    className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 disabled:opacity-50"
                  >
                    Request Changes
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approveSubmission.isLoading || (isTextContent && !editedContent.trim())}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {approveSubmission.isLoading ? 'Approving...' : 'Approve Content'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
