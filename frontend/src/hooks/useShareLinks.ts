import {
  useQuery,
  useMutation,
  createConnectQueryKey,
} from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  createShareLink,
  listShareLinks,
  updateShareLinkEmails,
  deactivateShareLink,
  listCourseReviewComments,
} from '@/gen/mirai/v1/course_share-CourseShareService_connectquery';
import {
  CreateShareLinkRequestSchema,
  UpdateShareLinkEmailsRequestSchema,
  DeactivateShareLinkRequestSchema,
  ShareLinkStatus,
} from '@/gen/mirai/v1/course_share_pb';

export function useCreateShareLink() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createShareLink);

  return {
    mutate: async (data: { courseId: string; allowedEmails: string[] }) => {
      const request = create(CreateShareLinkRequestSchema, {
        courseId: data.courseId,
        allowedEmails: data.allowedEmails,
      });
      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listShareLinks,
          cardinality: undefined,
        }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useListShareLinks(courseId: string) {
  const query = useQuery(listShareLinks, { courseId }, {
    enabled: !!courseId,
    refetchInterval: (q) => {
      const links = q.state.data?.shareLinks;
      const hasPending = links?.some(
        (l) =>
          l.status === ShareLinkStatus.PENDING ||
          l.status === ShareLinkStatus.SNAPSHOTTING,
      );
      return hasPending ? 2000 : false;
    },
  });

  return {
    data: query.data?.shareLinks ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUpdateShareLinkEmails() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateShareLinkEmails);

  return {
    mutate: async (data: {
      shareLinkId: string;
      allowedEmails: string[];
    }) => {
      const request = create(UpdateShareLinkEmailsRequestSchema, {
        shareLinkId: data.shareLinkId,
        allowedEmails: data.allowedEmails,
      });
      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listShareLinks,
          cardinality: undefined,
        }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useDeactivateShareLink() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deactivateShareLink);

  return {
    mutate: async (shareLinkId: string) => {
      const request = create(DeactivateShareLinkRequestSchema, {
        shareLinkId,
      });
      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listShareLinks,
          cardinality: undefined,
        }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useListCourseReviewComments(courseId: string) {
  const query = useQuery(
    listCourseReviewComments,
    { courseId },
    { enabled: !!courseId }
  );

  return {
    data: query.data?.comments ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
