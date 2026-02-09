import {
  useQuery,
  useMutation,
  createConnectQueryKey,
} from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  verifyShareToken,
  sendVerificationCode,
  verifyEmailCode,
  getSharedCourse,
  getSharedLesson,
  addReviewComment,
  listLessonReviewComments,
  exportSharedCoursePDF,
} from '@/gen/mirai/v1/course_share-CourseShareService_connectquery';
import {
  VerifyShareTokenRequestSchema,
  SendVerificationCodeRequestSchema,
  VerifyEmailCodeRequestSchema,
  GetSharedCourseRequestSchema,
  GetSharedLessonRequestSchema,
  AddReviewCommentRequestSchema,
  ExportSharedCoursePDFRequestSchema,
} from '@/gen/mirai/v1/course_share_pb';

export function useVerifyShareToken(token: string) {
  const query = useQuery(
    verifyShareToken,
    { token },
    { enabled: !!token }
  );

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useSendVerificationCode() {
  const mutation = useMutation(sendVerificationCode);

  return {
    mutate: async (data: { token: string; email: string }) => {
      const request = create(SendVerificationCodeRequestSchema, {
        token: data.token,
        email: data.email,
      });
      return mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useVerifyEmailCode() {
  const mutation = useMutation(verifyEmailCode);

  return {
    mutate: async (data: { token: string; email: string; code: string }) => {
      const request = create(VerifyEmailCodeRequestSchema, {
        token: data.token,
        email: data.email,
        code: data.code,
      });
      return mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useGetSharedCourse(sessionToken: string) {
  const query = useQuery(
    getSharedCourse,
    { sessionToken },
    { enabled: !!sessionToken }
  );

  return {
    data: query.data?.course,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useGetSharedLesson(sessionToken: string, lessonId: string) {
  const query = useQuery(
    getSharedLesson,
    { sessionToken, lessonId },
    { enabled: !!sessionToken && !!lessonId }
  );

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useAddReviewComment() {
  const queryClient = useQueryClient();
  const mutation = useMutation(addReviewComment);

  return {
    mutate: async (data: {
      sessionToken: string;
      lessonId: string;
      comment: string;
    }) => {
      const request = create(AddReviewCommentRequestSchema, {
        sessionToken: data.sessionToken,
        lessonId: data.lessonId,
        comment: data.comment,
      });
      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listLessonReviewComments,
          cardinality: undefined,
        }),
      });
      // Also invalidate shared lesson queries
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getSharedLesson,
          cardinality: undefined,
        }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useListLessonReviewComments(
  sessionToken: string,
  lessonId: string
) {
  const query = useQuery(
    listLessonReviewComments,
    { sessionToken, lessonId },
    { enabled: !!sessionToken && !!lessonId }
  );

  return {
    data: query.data?.comments ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useExportSharedPDF() {
  const mutation = useMutation(exportSharedCoursePDF);

  return {
    mutate: async (sessionToken: string) => {
      const request = create(ExportSharedCoursePDFRequestSchema, {
        sessionToken,
      });
      return mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
