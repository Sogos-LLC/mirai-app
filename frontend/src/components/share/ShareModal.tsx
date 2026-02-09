'use client';

import { useState, useCallback } from 'react';
import { X, Copy, Check, Share2, Trash2, Plus, Mail } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  useCreateShareLink,
  useListShareLinks,
  useUpdateShareLinkEmails,
  useDeactivateShareLink,
  useListCourseReviewComments,
} from '@/hooks/useShareLinks';
import type { CourseShareLink, ReviewComment } from '@/gen/mirai/v1/course_share_pb';

interface ShareModalProps {
  courseId: string;
  courseTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareModal({
  courseId,
  courseTitle,
  isOpen,
  onClose,
}: ShareModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: shareLinks, isLoading: linksLoading } =
    useListShareLinks(courseId);
  const { data: comments } = useListCourseReviewComments(courseId);
  const createShareLink = useCreateShareLink();
  const updateEmails = useUpdateShareLinkEmails();
  const deactivateLink = useDeactivateShareLink();

  const handleAddEmail = useCallback(() => {
    const email = emailInput.trim().toLowerCase();
    if (email && !emails.includes(email)) {
      setEmails([...emails, email]);
      setEmailInput('');
    }
  }, [emailInput, emails]);

  const handleRemoveEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  const handleCreateLink = async () => {
    await createShareLink.mutate({
      courseId,
      allowedEmails: emails,
    });
    setEmails([]);
  };

  const handleCopyLink = async (link: CourseShareLink) => {
    await navigator.clipboard.writeText(link.shareUrl);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeactivate = async (linkId: string) => {
    await deactivateLink.mutate(linkId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-surface shadow-xl border max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-primary">
              Share Course
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:text-primary hover:bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Create new share link */}
          <div>
            <h3 className="text-sm font-medium text-primary mb-2">
              Create Share Link
            </h3>
            <p className="text-sm text-secondary mb-3">
              Add allowed reviewer emails (optional). Leave empty to allow
              anyone with the link.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                placeholder="reviewer@example.com"
                className="flex-1 rounded-md border bg-page px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Button
                variant="secondary"
                onClick={handleAddEmail}
                disabled={!emailInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {emails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 text-xs text-indigo-700 dark:text-indigo-300"
                  >
                    <Mail className="h-3 w-3" />
                    {email}
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Button
              variant="primary"
              onClick={handleCreateLink}
              disabled={createShareLink.isLoading}
              className="w-full"
            >
              {createShareLink.isLoading
                ? 'Creating...'
                : 'Create Share Link'}
            </Button>
          </div>

          {/* Active share links */}
          {shareLinks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-primary mb-2">
                Active Share Links
              </h3>
              <div className="space-y-3">
                {shareLinks
                  .filter((link: CourseShareLink) => link.isActive)
                  .map((link: CourseShareLink) => (
                    <div
                      key={link.id}
                      className="rounded-md border bg-page p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-xs text-secondary truncate max-w-[280px]">
                          {link.shareUrl}
                        </code>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCopyLink(link)}
                            className="rounded p-1 hover:bg-hover text-muted hover:text-primary"
                            title="Copy link"
                          >
                            {copiedId === link.id ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeactivate(link.id)}
                            className="rounded p-1 hover:bg-hover text-muted hover:text-red-500"
                            title="Deactivate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {link.allowedEmails.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {link.allowedEmails.map((email: string) => (
                            <span
                              key={email}
                              className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-secondary"
                            >
                              {email}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Review comments summary */}
          {comments.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-primary mb-2">
                Review Comments ({comments.length})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {comments.map((comment: ReviewComment) => (
                  <div
                    key={comment.id}
                    className="rounded-md border bg-page p-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-primary">
                        {comment.reviewerEmail}
                      </span>
                      <span className="text-xs text-muted">
                        Lesson: {comment.lessonId}
                      </span>
                    </div>
                    <p className="text-sm text-secondary">{comment.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
