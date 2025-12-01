'use client';

import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { SMEScope } from '@/gen/mirai/v1/sme_pb';

interface CreateSMEModalProps {
  onClose: () => void;
  onCreate: (data: CreateSMEData) => Promise<void>;
  teams?: Array<{ id: string; name: string }>;
}

export interface CreateSMEData {
  name: string;
  description: string;
  domain: string;
  scope: SMEScope;
  teamIds: string[];
}

const SCOPE_OPTIONS = [
  { value: 1, label: 'Global', description: 'Available to all teams in the organization' },
  { value: 2, label: 'Team', description: 'Only available to selected teams' },
];

export function CreateSMEModal({ onClose, onCreate, teams = [] }: CreateSMEModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('');
  const [scope, setScope] = useState<SMEScope>(1); // Default to Global
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onCreate({
        name,
        description,
        domain,
        scope,
        teamIds: scope === 2 ? selectedTeamIds : [],
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create SME');
      }
      setLoading(false);
    }
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} title="Create Subject Matter Expert">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px]"
              placeholder="Sales Training Expert, Product Knowledge Base..."
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border"
              placeholder="Describe what knowledge this SME will contain..."
            />
          </div>

          {/* Domain */}
          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
              Knowledge Domain
            </label>
            <input
              type="text"
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px]"
              placeholder="Sales, Product, Compliance, Customer Service..."
            />
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Access Scope</label>
            <div className="space-y-2">
              {SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                    scope === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Team Selection (only shown when scope is Team) */}
          {scope === 2 && teams.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Teams</label>
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                {teams.map((team) => (
                  <label
                    key={team.id}
                    className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">{team.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {scope === 2 && teams.length === 0 && (
            <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              No teams available. Create teams first to use team-scoped SMEs.
            </div>
          )}

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
            {loading ? 'Creating...' : 'Create SME'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
