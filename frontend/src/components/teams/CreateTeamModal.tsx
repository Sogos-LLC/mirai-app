'use client';

import { useState } from 'react';
import { APIError } from '@/lib/api/client';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

interface CreateTeamModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}

export function CreateTeamModal({ onClose, onCreate }: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onCreate(name, description);
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message);
      } else {
        setError('Failed to create team');
      }
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={true}
      onClose={onClose}
      title="Create New Team"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 space-y-4">
          {/* Team Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Team Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px]"
              placeholder="Engineering, Marketing, Sales..."
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border"
              placeholder="Brief description of this team..."
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {loading ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
