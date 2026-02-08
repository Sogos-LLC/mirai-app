'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@connectrpc/connect-query';
import { Users, Send, Loader2, Plus, X } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import { useListTeams } from '@/hooks/useTeams';
import { useCreateGapTasks } from '@/hooks/useKnowledgeGapTasks';
import { listCompanyUsers } from '@/gen/mirai/v1/user-UserService_connectquery';
import type { User } from '@/gen/mirai/v1/common_pb';

interface GapItem {
  description: string;
  selected: boolean;
  assignedToUserId: string;
  isCustom?: boolean;
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
  const [items, setItems] = useState<GapItem[]>(
    gaps.map((gap) => ({ description: gap, selected: false, assignedToUserId: '' }))
  );
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGapText, setNewGapText] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  const { data: teams } = useListTeams();
  const { data: companyUsersData } = useQuery(listCompanyUsers, {});
  const createGapTasks = useCreateGapTasks();

  const companyUsers = useMemo(
    () => companyUsersData?.users ?? [],
    [companyUsersData]
  );

  const selectedItems = useMemo(() => items.filter((i) => i.selected), [items]);

  const canSubmit = useMemo(() => {
    if (!selectedTeamId) return false;
    if (selectedItems.length === 0) return false;
    return selectedItems.every((i) => i.assignedToUserId !== '');
  }, [selectedTeamId, selectedItems]);

  const toggleSelection = useCallback((index: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  }, []);

  const handleAssigneeChange = useCallback((index: number, userId: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, assignedToUserId: userId } : item))
    );
  }, []);

  const handleAssignAllSelected = useCallback((userId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.selected ? { ...item, assignedToUserId: userId } : item))
    );
  }, []);

  const handleAddCustomGap = useCallback(() => {
    const trimmed = newGapText.trim();
    if (!trimmed) return;
    setItems((prev) => [
      ...prev,
      { description: trimmed, selected: true, assignedToUserId: '', isCustom: true },
    ]);
    setNewGapText('');
    setShowAddInput(false);
  }, [newGapText]);

  const handleRemoveCustomGap = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await createGapTasks.mutate({
        courseId,
        targetTeamId: selectedTeamId,
        tasks: selectedItems.map((item) => ({
          gapDescription: item.description,
          assignedToUserId: item.assignedToUserId,
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
          Select the knowledge gaps you want to address and assign them to team members.
          The course will be saved as a draft until selected gaps are resolved.
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

        {/* Bulk assign selected */}
        {companyUsers.length > 0 && selectedItems.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted shrink-0" />
            <span className="text-xs text-muted">Assign selected to:</span>
            <select
              onChange={(e) => {
                if (e.target.value) handleAssignAllSelected(e.target.value);
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
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {items.map((item, index) => (
            <div
              key={index}
              className={`rounded-lg border p-3 transition-colors ${
                item.selected
                  ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20'
                  : 'bg-page'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggleSelection(index)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <p
                      className={`text-sm flex-1 ${item.selected ? 'text-primary' : 'text-muted'}`}
                      onClick={() => toggleSelection(index)}
                      role="button"
                    >
                      {item.description}
                    </p>
                    {item.isCustom && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomGap(index)}
                        className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted hover:text-red-500 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {item.selected && (
                    <select
                      value={item.assignedToUserId}
                      onChange={(e) => handleAssigneeChange(index, e.target.value)}
                      className="mt-2 w-full px-2 py-1.5 bg-surface border rounded text-xs text-primary min-h-[36px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Assign to...</option>
                      {companyUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {getDisplayName(user)}
                          {user.email ? ` (${user.email})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Add custom gap */}
          {showAddInput ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed">
              <input
                type="text"
                value={newGapText}
                onChange={(e) => setNewGapText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustomGap();
                  if (e.key === 'Escape') { setShowAddInput(false); setNewGapText(''); }
                }}
                placeholder="Describe the knowledge gap..."
                className="flex-1 px-2 py-1.5 bg-page border rounded text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddCustomGap}
                disabled={!newGapText.trim()}
              >
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowAddInput(false); setNewGapText(''); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddInput(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-dashed text-sm text-muted hover:text-secondary hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Add custom gap
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {selectedItems.length > 0 && (
              <span className="text-xs text-muted">
                {selectedItems.length} gap{selectedItems.length !== 1 ? 's' : ''} selected
              </span>
            )}
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
      </div>
    </ResponsiveModal>
  );
}
