'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  useGetSharedLesson,
  useAddReviewComment,
  useListLessonReviewComments,
} from '@/hooks/useShareViewer';
import { useShareSession } from '@/store/zustand/shareSession';
import type { ReviewComment } from '@/gen/mirai/v1/course_share_pb';

export default function SharedLessonPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const lessonId = params.lessonId as string;

  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);

  const { sessionToken, email } = useShareSession();
  const { data: lesson, isLoading } = useGetSharedLesson(
    sessionToken,
    lessonId
  );
  const { data: comments } = useListLessonReviewComments(
    sessionToken,
    lessonId
  );
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

  if (!sessionToken) {
    router.push(`/shared/${token}`);
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-secondary">Lesson not found.</p>
      </div>
    );
  }

  // Parse components from JSON
  let components: Array<{ type: string; content: Record<string, unknown> }> = [];
  try {
    components = JSON.parse(lesson.contentJson || '[]');
  } catch {
    // Invalid JSON, render empty
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b bg-surface sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push(`/shared/${token}/view`)}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to course
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary"
          >
            <MessageSquare className="h-4 w-4" />
            Comments ({comments.length})
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Main content */}
        <div
          className={`flex-1 transition-all ${
            showComments ? 'max-w-3xl' : 'max-w-4xl mx-auto'
          }`}
        >
          <div className="px-6 py-8">
            <h1 className="text-2xl font-bold text-primary mb-6">
              {lesson.title}
            </h1>

            {/* Render components */}
            <div className="space-y-6">
              {components.map((comp, idx) => (
                <div key={idx} className="prose dark:prose-invert max-w-none">
                  <ComponentRenderer type={comp.type} content={comp.content} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comments sidebar */}
        {showComments && (
          <div className="w-80 border-l bg-surface min-h-[calc(100vh-49px)] flex flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-medium text-primary">
                Review Comments
              </h3>
              <button
                onClick={() => setShowComments(false)}
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
                <div
                  key={comment.id}
                  className="rounded-md border bg-page p-3"
                >
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
        )}
      </div>
    </div>
  );
}

// Simple component renderer for shared view
function ComponentRenderer({
  type,
  content,
}: {
  type: string;
  content: Record<string, unknown>;
}) {
  switch (type) {
    case 'text':
      return (
        <div
          dangerouslySetInnerHTML={{
            __html: (content.text as string) || (content.paragraphs as string) || '',
          }}
        />
      );
    case 'heading':
      return (
        <h2 className="text-xl font-semibold">
          {content.text as string}
        </h2>
      );
    case 'image':
      return (
        <figure>
          {content.url ? (
            <img
              src={content.url as string}
              alt={(content.alt as string) || ''}
              className="rounded-lg max-w-full"
            />
          ) : null}
          {content.caption ? (
            <figcaption className="text-sm text-muted mt-2 text-center">
              {content.caption as string}
            </figcaption>
          ) : null}
        </figure>
      );
    case 'callout':
      return (
        <div className="rounded-md border-l-4 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 p-4">
          {content.title ? (
            <p className="font-medium mb-1">{content.title as string}</p>
          ) : null}
          <p>{content.text as string}</p>
        </div>
      );
    case 'quiz':
      return (
        <div className="rounded-md border p-4">
          <p className="font-medium mb-2">
            {content.question as string}
          </p>
          <ul className="space-y-1">
            {(content.options as string[] || []).map(
              (opt: string, i: number) => (
                <li key={i} className="text-sm text-secondary">
                  {i + 1}. {opt}
                </li>
              )
            )}
          </ul>
        </div>
      );
    case 'code':
      return (
        <pre className="rounded-md bg-gray-900 p-4 overflow-x-auto">
          <code className="text-sm text-green-400">
            {content.code as string}
          </code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote className="border-l-4 border-gray-300 pl-4 italic">
          <p>{content.text as string}</p>
          {content.attribution ? (
            <cite className="text-sm text-muted not-italic">
              — {content.attribution as string}
            </cite>
          ) : null}
        </blockquote>
      );
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-1">
          {((content.items as string[]) || []).map(
            (item: string, i: number) => (
              <li key={i}>{item}</li>
            )
          )}
        </ul>
      );
    case 'divider':
      return <hr className="my-4" />;
    default:
      return (
        <div className="rounded-md border p-4 text-sm text-secondary">
          <p className="font-medium">{type}</p>
          <pre className="text-xs mt-1 overflow-x-auto">
            {JSON.stringify(content, null, 2)}
          </pre>
        </div>
      );
  }
}
