import { useMutation, createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  createFolder,
  deleteFolder,
  getFolderHierarchy,
  getLibrary,
} from '@/gen/mirai/v1/course-CourseService_connectquery';
import {
  FolderType,
  CreateFolderRequestSchema,
  DeleteFolderRequestSchema,
} from '@/gen/mirai/v1/course_pb';

export function useCreateFolder() {
  const queryClient = useQueryClient();
  const mutation = useMutation(createFolder);

  return {
    mutate: async (folderData: {
      name: string;
      parentId?: string;
      type?: FolderType;
    }) => {
      const request = create(CreateFolderRequestSchema, {
        name: folderData.name,
        parentId: folderData.parentId,
        type: folderData.type ?? FolderType.FOLDER,
      });

      const result = await mutation.mutateAsync(request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getFolderHierarchy, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getLibrary, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteFolder);

  return {
    mutate: async (folderId: string) => {
      const request = create(DeleteFolderRequestSchema, { id: folderId });
      const result = await mutation.mutateAsync(request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getFolderHierarchy, cardinality: undefined }) }),
        queryClient.invalidateQueries({ queryKey: createConnectQueryKey({ schema: getLibrary, cardinality: undefined }) }),
      ]);
      return result;
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
