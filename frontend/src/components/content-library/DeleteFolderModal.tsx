'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { type FolderType } from '@/hooks/useCourses';

export interface DeleteFolderModalProps {
  folder: { id: string; name: string; type: FolderType | string } | null;
  isDeleting: boolean;
  deleteError: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteFolderModal({ folder, isDeleting, deleteError, onConfirm, onCancel }: DeleteFolderModalProps) {
  return (
    <ResponsiveModal
      isOpen={!!folder}
      onClose={onCancel}
      title="Delete Folder"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-gray-600 dark:text-gray-400">
          Are you sure you want to delete the folder <strong className="text-gray-900 dark:text-white">&quot;{folder?.name}&quot;</strong>?
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This action cannot be undone. The folder must be empty to be deleted.
        </p>

        {deleteError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            {deleteError}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 lg:py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-50 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-400 transition-colors font-medium min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 lg:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete Folder
              </>
            )}
          </button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
