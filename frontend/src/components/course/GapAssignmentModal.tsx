'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@connectrpc/connect-query';
import { Users, Send, Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import { useListTeams } from '@/hooks/useTeams';
import { useCreateGapTasks } from '@/hooks/useKnowledgeGapTasks';
import { listCompanyUsers } from '@/gen/mirai/v1/user-UserService_connectquery';
import type { User } from '@/gen/mirai/v1/common_pb';

interface GapAssignment {
  gapDescription: string;
  assignedToUserId: string;
}

interface GapAssignmentModalProps {
  courseId: string;
  gaps: string[];
  onClose: () => void;
  onDefer: () => void;
}

function getDisplayName(user: User): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return user.email || 'Unknown User';
}

export function GapAssignmentModal({ courseId, gaps, onClose, onDefer }: GapAssignmentModalProps) {
  const [assignments, setAssignments] = useState<GapAssignment[]>(
    gaps.map((gap) => ({ gapDescription: gap, assignedToUserId: '' }))
  );
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: teams } = useListTeams();
  const { data: companyUsersData } = useQuery(listCompanyUsers, {});
  const createGapTasks = useCreateGapTasks();

  const companyUsers = useMemo(
    () => companyUsersData?.users ?? [],
    [companyUsersData]
  );

  const canSubmit = useMemo(() => {
    if (!selectedTeamId) return false;
    return assignments.every((a) => a.assignedToUserId !== '');
  }, [selectedTeamId, assignments]);

  const handleAssigneeChange = (index: number, userId: string) => {
    setAssignments((prev) =>
      prev.map((a, i) => (i === index ? { ...a, assignedToUserId: userId } : a))
    );
  };

  const handleAssignAll = (userId: string) => {
    setAssignments((prev) => prev.map((a) => ({ ...a, assignedToUserId: userId })));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await createGapTasks.mutate({
        courseId,
        targetTeamId: selectedTeamId,
        tasks: assignments.map((a) => ({
          gapDescription: a.gapDescription,
          assignedToUserId: a.assignedToUserId,
        })),
      });

      // Trigger workflow deferral
      onDefer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create gap tasks');
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen
      onClose={onClose}
      title="Assign Knowledge Gaps"
      size="lg"
    >
      <div className="space-y-5">
        <p className="text-sm text-secondary">
          Assign each knowledge gap to a team member. They&apos;ll be notified and can upload
          documents to fill the gaps. The course will be saved as a draft until gaps are resolved.
        </p>

        {/* Team selector */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">
            Upload to Team Knowledge
          </label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="w-full px-3 py-2 bg-page border rounded-lg text-primary text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select a team...</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1">
            Uploaded documents will be added to this team&apos;s knowledge base.
          </p>
        </div>

        {/* Bulk assign */}
        {companyUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted shrink-0" />
            <span className="text-xs text-muted">Assign all to:</span>
            <select
              onChange={(e) => {
                if (e.target.value) handleAssignAll(e.target.value);
              }}
              className="px-2 py-1 bg-page border rounded text-xs text-primary min-h-[32px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              defaultValue=""
            >
              <option value="" disabled>Select...</option>
              {companyUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {getDisplayName(user)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Gap rows */}
        <div className="space-y-3 max-h-[40vh] overflow-y-auto">
          {assignments.map((assignment, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg border bg-page p-3"
            >
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-primary mb-2">{assignment.gapDescription}</p>
                <select
                  value={assignment.assignedToUserId}
                  onChange={(e) => handleAssigneeChange(index, e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface border rounded text-xs text-primary min-h-[36px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Assign to...</option>
                  {companyUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getDisplayName(user)}
                      {user.email ? ` (${user.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Assign & Save Draft
              </>
            )}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
