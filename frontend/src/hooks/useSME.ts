import { useQuery, useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  createSME,
  getSME,
  listSMEs,
  updateSME,
  deleteSME,
  restoreSME,
  createTask,
  getTask,
  listTasks,
  updateTask,
  cancelTask,
  deleteTask,
  getUploadURL,
  submitContent,
  listSubmissions,
  getSubmission,
  approveSubmission,
  requestSubmissionChanges,
  enhanceSubmissionContent,
  getKnowledge,
  updateKnowledgeChunk,
  deleteKnowledgeChunk,
} from '@/gen/mirai/v1/sme-SMEService_connectquery';
import {
  SMEScope,
  SMEStatus,
  SMETaskStatus,
  ContentType,
  EnhanceType,
  type SubjectMatterExpert,
  type SMETask,
  type SMETaskSubmission,
  type SMEKnowledgeChunk,
  CreateSMERequestSchema,
  UpdateSMERequestSchema,
  DeleteSMERequestSchema,
  RestoreSMERequestSchema,
  ListSMEsRequestSchema,
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  CancelTaskRequestSchema,
  DeleteTaskRequestSchema,
  GetUploadURLRequestSchema,
  SubmitContentRequestSchema,
  GetSubmissionRequestSchema,
  ApproveSubmissionRequestSchema,
  RequestSubmissionChangesRequestSchema,
  EnhanceSubmissionContentRequestSchema,
  UpdateKnowledgeChunkRequestSchema,
  DeleteKnowledgeChunkRequestSchema,
} from '@/gen/mirai/v1/sme_pb';

// Re-export types and enums
export { SMEScope, SMEStatus, SMETaskStatus, ContentType, EnhanceType };
export type { SubjectMatterExpert, SMETask, SMETaskSubmission, SMEKnowledgeChunk };

/**
 * Hook to list all SMEs accessible to the current user.
 */
export function useListSMEs(options?: { includeArchived?: boolean }) {
  const request = create(ListSMEsRequestSchema, {
    includeArchived: options?.includeArchived,
  });
  const query = useQuery(listSMEs, request);

  return {
    data: query.data?.smes ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a single SME by ID.
 */
export function useGetSME(smeId: string | undefined) {
  const query = useQuery(
    getSME,
    smeId ? { smeId } : undefined,
    { enabled: !!smeId }
  );

  return {
    data: query.data?.sme,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to create a new SME.
 */
export function useCreateSME() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createSME);

  return {
    mutate: async (data: {
      name: string;
      description?: string;
      domain: string;
      scope: SMEScope;
      teamIds?: string[];
    }) => {
      const request = create(CreateSMERequestSchema, {
        name: data.name,
        description: data.description,
        domain: data.domain,
        scope: data.scope,
        teamIds: data.teamIds ?? [],
      });

      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listSMEs, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to update an SME.
 */
export function useUpdateSME() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateSME);

  return {
    mutate: async (
      smeId: string,
      data: {
        name?: string;
        description?: string;
        domain?: string;
        scope?: SMEScope;
      }
    ) => {
      const request = create(UpdateSMERequestSchema, {
        smeId,
        name: data.name,
        description: data.description,
        domain: data.domain,
        scope: data.scope,
      });

      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation for both list and individual queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listSMEs, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getSME, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to delete (archive) an SME.
 */
export function useDeleteSME() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteSME);

  return {
    mutate: async (smeId: string) => {
      const request = create(DeleteSMERequestSchema, { smeId });
      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listSMEs, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to restore an archived SME.
 */
export function useRestoreSME() {
  const queryClient = useQueryClient();
  const mutation = useMutation(restoreSME);

  return {
    mutate: async (smeId: string) => {
      const request = create(RestoreSMERequestSchema, { smeId });
      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation for both list and individual queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listSMEs, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getSME, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to list tasks with optional filters.
 */
export function useListTasks(filters?: {
  smeId?: string;
  assignedToUserId?: string;
}) {
  const query = useQuery(listTasks, {
    smeId: filters?.smeId,
    assignedToUserId: filters?.assignedToUserId,
  });

  return {
    data: query.data?.tasks ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a single task.
 */
export function useGetTask(taskId: string | undefined) {
  const query = useQuery(
    getTask,
    taskId ? { taskId } : undefined,
    { enabled: !!taskId }
  );

  return {
    data: query.data?.task,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to create a task.
 */
export function useCreateTask() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createTask);

  return {
    mutate: async (data: {
      smeId: string;
      title: string;
      description?: string;
      expectedContentType?: ContentType;
      assignedToUserId: string;
      teamId?: string;
      dueDate?: Date;
    }) => {
      const request = create(CreateTaskRequestSchema, {
        smeId: data.smeId,
        title: data.title,
        description: data.description,
        expectedContentType: data.expectedContentType,
        assignedToUserId: data.assignedToUserId,
        teamId: data.teamId,
        dueDate: data.dueDate ? { seconds: BigInt(Math.floor(data.dueDate.getTime() / 1000)), nanos: 0 } : undefined,
      });

      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listTasks, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to cancel a task.
 */
export function useCancelTask() {
  const queryClient = useQueryClient();
  const mutation = useMutation(cancelTask);

  return {
    mutate: async (taskId: string) => {
      const request = create(CancelTaskRequestSchema, { taskId });
      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listTasks, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getTask, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to get a presigned upload URL.
 */
export function useGetUploadURL() {
  const mutation = useMutation(getUploadURL);

  return {
    mutate: async (data: {
      taskId: string;
      fileName: string;
      contentType: ContentType;
    }) => {
      const request = create(GetUploadURLRequestSchema, {
        taskId: data.taskId,
        fileName: data.fileName,
        contentType: data.contentType,
      });

      return await mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to submit content for a task.
 */
export function useSubmitContent() {
  const queryClient = useQueryClient();
  const mutation = useMutation(submitContent);

  return {
    mutate: async (data: {
      taskId: string;
      fileName: string;
      filePath: string;
      contentType: ContentType;
      fileSizeBytes: number;
      textContent?: string;
    }) => {
      const request = create(SubmitContentRequestSchema, {
        taskId: data.taskId,
        fileName: data.fileName,
        filePath: data.filePath,
        contentType: data.contentType,
        fileSizeBytes: BigInt(data.fileSizeBytes),
        textContent: data.textContent,
      });

      const result = await mutation.mutateAsync(request);
      // Use type-safe cache invalidation
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listTasks, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listSubmissions, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to list submissions for a task.
 */
export function useListSubmissions(taskId: string | undefined) {
  const query = useQuery(
    listSubmissions,
    taskId ? { taskId } : undefined,
    { enabled: !!taskId }
  );

  return {
    data: query.data?.submissions ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get knowledge chunks for an SME.
 */
export function useGetKnowledge(smeId: string | undefined) {
  const query = useQuery(
    getKnowledge,
    smeId ? { smeId } : undefined,
    { enabled: !!smeId }
  );

  return {
    data: query.data?.chunks ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to update a task.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateTask);

  return {
    mutate: async (
      taskId: string,
      data: {
        title?: string;
        description?: string;
        expectedContentType?: ContentType;
        dueDate?: Date;
      }
    ) => {
      const request = create(UpdateTaskRequestSchema, {
        taskId,
        title: data.title,
        description: data.description,
        expectedContentType: data.expectedContentType,
        dueDate: data.dueDate
          ? { seconds: BigInt(Math.floor(data.dueDate.getTime() / 1000)), nanos: 0 }
          : undefined,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listTasks, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getTask, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to delete a task.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteTask);

  return {
    mutate: async (taskId: string) => {
      const request = create(DeleteTaskRequestSchema, { taskId });
      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: listTasks, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to get a single submission.
 */
export function useGetSubmission(submissionId: string | undefined) {
  const query = useQuery(
    getSubmission,
    submissionId ? { submissionId } : undefined,
    { enabled: !!submissionId }
  );

  return {
    data: query.data?.submission,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to approve a submission.
 */
export function useApproveSubmission() {
  const queryClient = useQueryClient();
  const mutation = useMutation(approveSubmission);

  return {
    mutate: async (data: { submissionId: string; approvedContent: string }) => {
      const request = create(ApproveSubmissionRequestSchema, {
        submissionId: data.submissionId,
        approvedContent: data.approvedContent,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listTasks, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getTask, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listSubmissions, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getSubmission, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getKnowledge, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to request changes to a submission.
 */
export function useRequestSubmissionChanges() {
  const queryClient = useQueryClient();
  const mutation = useMutation(requestSubmissionChanges);

  return {
    mutate: async (data: { submissionId: string; feedback: string }) => {
      const request = create(RequestSubmissionChangesRequestSchema, {
        submissionId: data.submissionId,
        feedback: data.feedback,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listTasks, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getTask, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: listSubmissions, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getSubmission, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to enhance submission content with AI (summarize or improve).
 * Only available for TEXT content type submissions.
 */
export function useEnhanceSubmissionContent() {
  const mutation = useMutation(enhanceSubmissionContent);

  return {
    mutate: async (data: { submissionId: string; enhanceType: EnhanceType }) => {
      const request = create(EnhanceSubmissionContentRequestSchema, {
        submissionId: data.submissionId,
        enhanceType: data.enhanceType,
      });

      return await mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to update a knowledge chunk.
 */
export function useUpdateKnowledgeChunk() {
  const queryClient = useQueryClient();
  const mutation = useMutation(updateKnowledgeChunk);

  return {
    mutate: async (data: {
      chunkId: string;
      content: string;
      topic?: string;
      keywords?: string[];
    }) => {
      const request = create(UpdateKnowledgeChunkRequestSchema, {
        chunkId: data.chunkId,
        content: data.content,
        topic: data.topic,
        keywords: data.keywords ?? [],
      });

      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getKnowledge, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Hook to delete a knowledge chunk.
 */
export function useDeleteKnowledgeChunk() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteKnowledgeChunk);

  return {
    mutate: async (chunkId: string) => {
      const request = create(DeleteKnowledgeChunkRequestSchema, { chunkId });
      const result = await mutation.mutateAsync(request);
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: getKnowledge, cardinality: undefined }),
      });
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
