import { useMutation } from '@connectrpc/connect-query';
import { create } from '@bufbuild/protobuf';
import { submitFeedback } from '@/gen/mirai/v1/feedback-FeedbackService_connectquery';
import { FeedbackType, SubmitFeedbackRequestSchema } from '@/gen/mirai/v1/feedback_pb';

// Re-export types and enums
export { FeedbackType };

export interface SubmitFeedbackParams {
  type: FeedbackType;
  message: string;
  pageUrl?: string;
  userAgent?: string;
}

/**
 * Hook to submit user feedback.
 */
export function useSubmitFeedback() {
  const mutation = useMutation(submitFeedback);

  return {
    mutate: async (params: SubmitFeedbackParams) => {
      const request = create(SubmitFeedbackRequestSchema, {
        type: params.type,
        message: params.message,
        pageUrl: params.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : ''),
        userAgent: params.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      });
      return await mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}
