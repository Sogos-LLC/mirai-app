'use client';

import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';

export interface CurriculumMapActionsProps {
  /** Whether the curriculum map is approved. */
  isApproved: boolean;
  /** Whether the map has validation errors. */
  mapHasErrors: boolean;
  /** Whether the map has validation warnings. */
  mapHasWarnings: boolean;
  /** Whether warnings have been acknowledged by the user. */
  acknowledgeWarnings: boolean;
  /** Whether the regenerate mutation is pending. */
  isRegenerating: boolean;
  /** Whether the approve mutation is pending. */
  isApproving: boolean;
  /** Called when the user clicks Regenerate. */
  onRegenerate: () => void;
  /** Called when the acknowledge-warnings checkbox changes. */
  onAcknowledgeWarningsChange: (checked: boolean) => void;
  /** Called when the user clicks Approve. */
  onApprove: () => void;
  /** Called when the user clicks Continue (after approval). */
  onContinue: () => void;
}

/**
 * Renders the curriculum map action bar: Regenerate button,
 * acknowledge-warnings checkbox, and Approve/Continue button.
 */
export function CurriculumMapActions({
  isApproved,
  mapHasErrors,
  mapHasWarnings,
  acknowledgeWarnings,
  isRegenerating,
  isApproving,
  onRegenerate,
  onAcknowledgeWarningsChange,
  onApprove,
  onContinue,
}: CurriculumMapActionsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-end items-center pb-8">
      <Button
        variant="ghost"
        onClick={onRegenerate}
        disabled={isRegenerating}
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
        Regenerate
      </Button>

      {!isApproved && (
        <>
          {mapHasWarnings && !mapHasErrors && (
            <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledgeWarnings}
                onChange={(e) => onAcknowledgeWarningsChange(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Acknowledge warnings
            </label>
          )}
          <Button
            variant="primary"
            onClick={onApprove}
            disabled={isApproving || mapHasErrors || (mapHasWarnings && !acknowledgeWarnings)}
          >
            {isApproving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Approving...
              </>
            ) : (
              'Approve Curriculum Map'
            )}
          </Button>
        </>
      )}

      {isApproved && (
        <Button
          variant="primary"
          onClick={onContinue}
        >
          Continue to Lesson Generation
        </Button>
      )}
    </div>
  );
}
