'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGetTeam, useUpdateTeam, useDeleteTeam, type Team } from '@/hooks/useTeams';
import { TeamMembersPanel } from '@/components/teams/TeamMembersPanel';
import { TeamKnowledgePanel } from '@/components/teams/TeamKnowledgePanel';
import { EditTeamModal } from '@/components/teams/EditTeamModal';
import { PageShell } from '@/components/layout/PageShell';

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: team, isLoading, error } = useGetTeam(teamId);
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const handleUpdate = async (data: { name?: string; description?: string }) => {
    await updateTeam.mutate(teamId, data);
    setShowEditModal(false);
  };

  const handleDelete = async () => {
    try {
      await deleteTeam.mutate(teamId);
      router.push('/teams');
    } catch (err) {
      console.error('Failed to delete team:', err);
      alert('Failed to delete team. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <PageShell maxWidth="4xl">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </PageShell>
    );
  }

  if (error || !team) {
    return (
      <PageShell
        maxWidth="4xl"
        backButton={{
          label: "Back to Teams",
          onClick: () => router.push('/teams')
        }}
      >
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">
            Failed to load team. The team may not exist or you don&apos;t have access.
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      backButton={{
        label: "Back to Teams",
        onClick: () => router.push('/teams')
      }}
      maxWidth="4xl"
    >
      {/* Team Header */}
      <div className="bg-surface shadow dark:shadow-glow-sm rounded-lg mb-6 border">
        <div className="px-4 py-5 sm:px-6 border-b border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">{team.name}</h1>
              {team.description && (
                <p className="mt-1 text-sm text-secondary">{team.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center px-3 py-2 border border text-sm font-medium rounded-md text-primary bg-surface hover:bg-hover"
              >
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600 dark:text-red-400">Delete?</span>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 text-sm font-medium text-primary bg-hover rounded hover:bg-surface-elevated"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-800 text-sm font-medium rounded-md text-red-700 dark:text-red-400 bg-surface hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Team Members Panel */}
      <TeamMembersPanel teamId={teamId} />

      {/* Team Knowledge Base */}
      <div className="mt-6">
        <TeamKnowledgePanel teamId={teamId} />
      </div>

      {/* Edit Team Modal */}
      {showEditModal && (
        <EditTeamModal
          team={team}
          onClose={() => setShowEditModal(false)}
          onSave={handleUpdate}
        />
      )}
    </PageShell>
  );
}
