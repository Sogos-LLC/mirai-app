'use client';

import { useState } from 'react';
import { X, Send } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  useAddReviewComment,
  useListLessonReviewComments,
} from '@/hooks/useShareViewer';
import type { ReviewComment } from '@/gen/mirai/v1/course_share_pb';

interface ReviewCommentsPanelProps {
  sessionToken: string;
  lessonId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function ReviewCommentsPanel({
  sessionToken,
  lessonId,
  isOpen,
  onToggle,
}: ReviewCommentsPanelProps) {
  const [commentText, setCommentText] = useState('');
  const { data: comments } = useListLessonReviewComments(sessionToken, lessonId);
  const addComment = useAddReviewComment();

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      await addComment.mutate({
        sessionToken,
        lessonId,
        comment: commentText.trim(),
      });
      setCommentText('');
    } catch {
      // Error handled by mutation state
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l bg-surface min-h-[calc(100vh-49px)] flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-medium text-primary">Review Comments</h3>
        <button
          onClick={onToggle}
          className="text-muted hover:text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {comments.length === 0 && (
          <p className="text-sm text-muted text-center py-4">
            No comments yet. Be the first to leave feedback.
          </p>
        )}
        {comments.map((comment: ReviewComment) => (
          <div key={comment.id} className="rounded-md border bg-page p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {comment.reviewerEmail}
              </span>
            </div>
            <p className="text-sm text-primary">{comment.comment}</p>
          </div>
        ))}
      </div>

      {/* Add comment */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Leave a comment..."
            rows={2}
            className="flex-1 rounded-md border bg-page px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <Button
          variant="primary"
          onClick={handleAddComment}
          disabled={!commentText.trim() || addComment.isLoading}
          className="w-full mt-2"
        >
          <Send className="h-3 w-3 mr-1" />
          {addComment.isLoading ? 'Sending...' : 'Add Comment'}
        </Button>
      </div>
    </div>
  );
}
