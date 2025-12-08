'use client';

import { useState } from 'react';
import { useListTeamMembers, useRemoveTeamMember, TeamRole, type TeamMember } from '@/hooks/useTeams';
import { AddTeamMemberModal } from './AddTeamMemberModal';

interface TeamMembersPanelProps {
  teamId: string;
}

const ROLE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Unknown', color: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300' },
  1: { label: 'Lead', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' },
  2: { label: 'Member', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' },
};

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0).toUpperCase() || '';
  const last = lastName?.charAt(0).toUpperCase() || '';
  return first + last || '?';
}

function getDisplayName(member: TeamMember): string {
  if (member.user?.firstName || member.user?.lastName) {
    return `${member.user.firstName || ''} ${member.user.lastName || ''}`.trim();
  }
  if (member.user?.email) {
    return member.user.email;
  }
  return `User ${member.userId.slice(0, 8)}...`;
}

export function TeamMembersPanel({ teamId }: TeamMembersPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const { data: members, isLoading, error } = useListTeamMembers(teamId);
  const removeMember = useRemoveTeamMember();

  const handleRemoveMember = async (member: TeamMember) => {
    if (!confirm(`Are you sure you want to remove this member from the team?`)) {
      return;
    }

    setRemovingMemberId(member.userId);
    try {
      await removeMember.mutate({
        teamId,
        userId: member.userId,
      });
    } catch (err) {
      console.error('Failed to remove member:', err);
      alert('Failed to remove member. Please try again.');
    } finally {
      setRemovingMemberId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface shadow dark:shadow-glow-sm rounded-lg border">
        <div className="px-4 py-5 sm:px-6 border-b border">
          <h2 className="text-lg font-medium text-primary">Team Members</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface shadow dark:shadow-glow-sm rounded-lg border">
        <div className="px-4 py-5 sm:px-6 border-b border">
          <h2 className="text-lg font-medium text-primary">Team Members</h2>
        </div>
        <div className="px-4 py-5 sm:px-6">
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
            <div className="text-sm text-red-700 dark:text-red-400">Failed to load team members.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface shadow dark:shadow-glow-sm rounded-lg border">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 border-b border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-primary">Team Members</h2>
          <p className="mt-1 text-sm text-secondary">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Member
        </button>
      </div>

      {/* Members List */}
      <div className="divide-y divide-border">{/* Using semantic divide color */}
        {members.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <svg
              className="mx-auto h-12 w-12 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-primary">No members yet</h3>
            <p className="mt-1 text-sm text-secondary">Add members to this team to get started.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Add First Member
            </button>
          </div>
        ) : (
          members.map((member) => {
            const role = ROLE_LABELS[member.role] || ROLE_LABELS[0];
            const isRemoving = removingMemberId === member.userId;
            const displayName = getDisplayName(member);
            const initials = getInitials(member.user?.firstName, member.user?.lastName);

            return (
              <div
                key={member.id}
                className="px-4 py-4 sm:px-6 flex items-center justify-between"
              >
                <div className="flex items-center">
                  {/* Avatar with initials */}
                  <div className="h-10 w-10 rounded-full bg-hover flex items-center justify-center text-sm font-medium text-secondary">
                    {member.user?.firstName || member.user?.lastName ? (
                      initials
                    ) : (
                      <svg className="h-6 w-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-primary">
                      {displayName}
                    </div>
                    {member.user?.email && displayName !== member.user.email && (
                      <div className="text-sm text-secondary">
                        {member.user.email}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${role.color}`}>
                        {role.label}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveMember(member)}
                  disabled={isRemoving}
                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50"
                  title="Remove from team"
                >
                  {isRemoving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600 dark:border-red-400" />
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <AddTeamMemberModal
          teamId={teamId}
          existingMemberIds={members.map((m) => m.userId)}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
