'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@connectrpc/connect-query';
import { SMEList } from '@/components/sme/SMEList';
import { CreateSMEModal, type CreateSMEData } from '@/components/sme/CreateSMEModal';
import { EditSMEModal, type UpdateSMEData } from '@/components/sme/EditSMEModal';
import { SMEDetailPanel } from '@/components/sme/SMEDetailPanel';
import { CreateTaskModal } from '@/components/sme/CreateTaskModal';
import { SubmitTextModal } from '@/components/sme/SubmitTextModal';
import { SubmissionReviewPanel } from '@/components/sme/SubmissionReviewPanel';
import { KnowledgeChunkEditor } from '@/components/sme/KnowledgeChunkEditor';
import {
  useListSMEs,
  useDeleteSME,
  useCreateSME,
  useUpdateSME,
  useRestoreSME,
  useListTasks,
  useCancelTask,
  useSubmitContent,
  useGetKnowledge,
  useUpdateKnowledgeChunk,
  useDeleteKnowledgeChunk,
  ContentType,
  type SubjectMatterExpert,
  type SMETask,
} from '@/hooks/useSME';
import type { SMEKnowledgeChunk } from '@/gen/mirai/v1/sme_pb';
import { useListTeams } from '@/hooks/useTeams';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { listCompanyUsers } from '@/gen/mirai/v1/user-UserService_connectquery';
import type { User } from '@/gen/mirai/v1/common_pb';

export default function SMEsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSME, setSelectedSME] = useState<SubjectMatterExpert | null>(null);
  const [editingSME, setEditingSME] = useState<SubjectMatterExpert | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [selectedTaskForSubmission, setSelectedTaskForSubmission] = useState<SMETask | null>(null);
  const [selectedTaskForReview, setSelectedTaskForReview] = useState<SMETask | null>(null);
  const [editingChunk, setEditingChunk] = useState<SMEKnowledgeChunk | null>(null);
  const [deletingChunkId, setDeletingChunkId] = useState<string | null>(null);

  // RTK Query hooks for data fetching
  const { data: smes, isLoading, error } = useListSMEs({ includeArchived: showArchived });
  const { data: teams = [], isLoading: teamsLoading } = useListTeams();
  const { user: currentUser } = useCurrentUser();
  const { data: companyUsersData } = useQuery(listCompanyUsers, {});
  const deleteSME = useDeleteSME();
  const createSME = useCreateSME();
  const updateSME = useUpdateSME();
  const restoreSME = useRestoreSME();
  const cancelTask = useCancelTask();
  const submitContent = useSubmitContent();
  const updateKnowledgeChunk = useUpdateKnowledgeChunk();
  const deleteKnowledgeChunk = useDeleteKnowledgeChunk();

  // Fetch tasks for the selected SME
  const { data: tasks = [], isLoading: isLoadingTasks } = useListTasks(
    selectedSME ? { smeId: selectedSME.id } : undefined
  );

  // Fetch knowledge chunks for the selected SME
  const { data: chunks = [], isLoading: isLoadingChunks } = useGetKnowledge(
    selectedSME?.id
  );

  // Build a map of user IDs to User objects for displaying assignee info
  const usersMap = useMemo(() => {
    const map = new Map<string, User>();
    if (companyUsersData?.users) {
      for (const user of companyUsersData.users) {
        map.set(user.id, user);
      }
    }
    return map;
  }, [companyUsersData?.users]);

  // Debug logging for teams
  useEffect(() => {
    if (teams.length === 0 && !teamsLoading) {
      console.warn('[SMEsPage] No teams available for selection');
    } else if (teams.length > 0) {
      console.log('[SMEsPage] Teams loaded:', teams.length);
    }
  }, [teams, teamsLoading]);

  const handleDelete = async (sme: SubjectMatterExpert) => {
    if (!confirm(`Are you sure you want to delete "${sme.name}"?`)) {
      return;
    }

    try {
      await deleteSME.mutate(sme.id);
      // Query cache is automatically invalidated by the hook
    } catch (err) {
      console.error('Failed to delete SME:', err);
      alert('Failed to delete SME. Please try again.');
    }
  };

  const handleCreate = async (data: CreateSMEData) => {
    await createSME.mutate({
      name: data.name,
      description: data.description,
      domain: data.domain,
      scope: data.scope,
      teamIds: data.teamIds,
    });
    setShowCreateModal(false);
    // Query cache is automatically invalidated by the hook
  };

  const handleEdit = (sme: SubjectMatterExpert) => {
    setEditingSME(sme);
  };

  const handleUpdate = async (smeId: string, data: UpdateSMEData) => {
    await updateSME.mutate(smeId, {
      name: data.name,
      description: data.description,
      domain: data.domain,
      scope: data.scope,
    });
    setEditingSME(null);
    // If we were editing the selected SME, update the selection with fresh data
    if (selectedSME?.id === smeId) {
      // The cache will be invalidated and the list will refresh
      // For now, close the detail panel to avoid stale data
      setSelectedSME(null);
    }
  };

  const handleRestore = async (sme: SubjectMatterExpert) => {
    try {
      await restoreSME.mutate(sme.id);
      // Query cache is automatically invalidated by the hook
    } catch (err) {
      console.error('Failed to restore SME:', err);
      alert('Failed to restore SME. Please try again.');
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to cancel this task?')) {
      return;
    }

    try {
      await cancelTask.mutate(taskId);
    } catch (err) {
      console.error('Failed to cancel task:', err);
      alert('Failed to cancel task. Please try again.');
    }
  };

  const handleSubmitText = async (data: { taskId: string; textContent: string; contentType: ContentType }) => {
    try {
      await submitContent.mutate({
        taskId: data.taskId,
        fileName: 'text-submission.txt',
        filePath: '',
        contentType: data.contentType,
        fileSizeBytes: data.textContent.length,
        textContent: data.textContent,
      });
      setSelectedTaskForSubmission(null);
    } catch (err) {
      console.error('Failed to submit content:', err);
      throw err; // Re-throw to let the modal handle the error
    }
  };

  const handleEditChunk = async (data: { chunkId: string; content: string; topic?: string; keywords?: string[] }) => {
    try {
      await updateKnowledgeChunk.mutate(data);
    } catch (err) {
      console.error('Failed to update knowledge chunk:', err);
      throw err;
    }
  };

  const handleDeleteChunk = async (chunkId: string) => {
    setDeletingChunkId(chunkId);
    try {
      await deleteKnowledgeChunk.mutate(chunkId);
    } catch (err) {
      console.error('Failed to delete knowledge chunk:', err);
      alert('Failed to delete knowledge chunk. Please try again.');
    } finally {
      setDeletingChunkId(null);
    }
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">
            Failed to load SMEs. Please try refreshing the page.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <SMEList
        smes={smes}
        isLoading={isLoading}
        showArchived={showArchived}
        onToggleArchived={setShowArchived}
        onSelect={setSelectedSME}
        onCreate={() => setShowCreateModal(true)}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onRestore={handleRestore}
      />

      {/* Create SME Modal */}
      {showCreateModal && (
        <CreateSMEModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          teams={teams.map(t => ({ id: t.id, name: t.name }))}
        />
      )}

      {/* SME Detail Panel (slide-over) */}
      {selectedSME && (
        <SMEDetailPanel
          sme={selectedSME}
          tasks={tasks}
          chunks={chunks}
          users={usersMap}
          currentUserId={currentUser?.id}
          isLoadingTasks={isLoadingTasks}
          isLoadingChunks={isLoadingChunks}
          isDeletingChunk={deletingChunkId ?? undefined}
          onBack={() => setSelectedSME(null)}
          onEdit={() => handleEdit(selectedSME)}
          onRestore={() => handleRestore(selectedSME)}
          onDelete={() => handleDelete(selectedSME)}
          onCreateTask={() => setShowCreateTaskModal(true)}
          onCancelTask={handleCancelTask}
          onSubmitToTask={(task) => setSelectedTaskForSubmission(task)}
          onReviewTask={(task) => setSelectedTaskForReview(task)}
          onEditChunk={(chunk) => setEditingChunk(chunk)}
          onDeleteChunk={handleDeleteChunk}
        />
      )}

      {/* Edit SME Modal */}
      {editingSME && (
        <EditSMEModal
          sme={editingSME}
          onClose={() => setEditingSME(null)}
          onSave={handleUpdate}
          teams={teams.map(t => ({ id: t.id, name: t.name }))}
        />
      )}

      {/* Create Task Modal */}
      {showCreateTaskModal && selectedSME && (
        <CreateTaskModal
          smeId={selectedSME.id}
          smeName={selectedSME.name}
          onClose={() => setShowCreateTaskModal(false)}
          onSuccess={() => setShowCreateTaskModal(false)}
        />
      )}

      {/* Submit Text Modal */}
      {selectedTaskForSubmission && selectedSME && (
        <SubmitTextModal
          taskId={selectedTaskForSubmission.id}
          taskTitle={selectedTaskForSubmission.title}
          smeName={selectedSME.name}
          onClose={() => setSelectedTaskForSubmission(null)}
          onSubmit={handleSubmitText}
        />
      )}

      {/* Submission Review Panel */}
      {selectedTaskForReview && selectedSME && (
        <SubmissionReviewPanel
          task={selectedTaskForReview}
          smeName={selectedSME.name}
          onClose={() => setSelectedTaskForReview(null)}
          onSuccess={() => setSelectedTaskForReview(null)}
        />
      )}

      {/* Knowledge Chunk Editor */}
      {editingChunk && (
        <KnowledgeChunkEditor
          chunk={editingChunk}
          onClose={() => setEditingChunk(null)}
          onSave={handleEditChunk}
          isLoading={updateKnowledgeChunk.isLoading}
        />
      )}
    </div>
  );
}
