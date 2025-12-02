'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@connectrpc/connect-query';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useAddTeamMember, TeamRole } from '@/hooks/useTeams';
import { listCompanyUsers } from '@/gen/mirai/v1/user-UserService_connectquery';
import type { User } from '@/gen/mirai/v1/common_pb';

interface AddTeamMemberModalProps {
  teamId: string;
  existingMemberIds: string[];
  onClose: () => void;
}

const ROLE_OPTIONS = [
  { value: TeamRole.MEMBER, label: 'Member', description: 'Regular team member' },
  { value: TeamRole.LEAD, label: 'Lead', description: 'Can manage team settings and members' },
];

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0).toUpperCase() || '';
  const last = lastName?.charAt(0).toUpperCase() || '';
  return first + last || '?';
}

function getDisplayName(user: User): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return user.email || 'Unknown User';
}

export function AddTeamMemberModal({ teamId, existingMemberIds, onClose }: AddTeamMemberModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [role, setRole] = useState<TeamRole>(TeamRole.MEMBER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const addMember = useAddTeamMember();
  const { data: companyUsersData, isLoading: isLoadingUsers } = useQuery(listCompanyUsers, {});

  // Filter users based on search query (case-insensitive, min 2 chars)
  const filteredUsers = useMemo(() => {
    if (!companyUsersData?.users || searchQuery.length < 2) {
      return [];
    }

    const query = searchQuery.toLowerCase();
    return companyUsersData.users.filter((user) => {
      // Exclude already-selected user and existing members
      if (selectedUser?.id === user.id) return false;
      if (existingMemberIds.includes(user.id)) return false;

      // Search in email, first name, and last name
      const email = user.email?.toLowerCase() || '';
      const firstName = user.firstName?.toLowerCase() || '';
      const lastName = user.lastName?.toLowerCase() || '';
      const fullName = `${firstName} ${lastName}`.trim();

      return (
        email.includes(query) ||
        firstName.includes(query) ||
        lastName.includes(query) ||
        fullName.includes(query)
      );
    });
  }, [companyUsersData?.users, searchQuery, selectedUser, existingMemberIds]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setSearchQuery(getDisplayName(user));
    setShowSuggestions(false);
    setError(null);
  };

  const handleClearSelection = () => {
    setSelectedUser(null);
    setSearchQuery('');
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      setError('Please select a user from the suggestions');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await addMember.mutate({
        teamId,
        userId: selectedUser.id,
        role,
      });
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to add team member');
      }
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} title="Add Team Member">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 space-y-4">
          {/* User Search Input */}
          <div className="relative">
            <label htmlFor="userSearch" className="block text-sm font-medium text-gray-700 mb-1">
              Search User
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                id="userSearch"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedUser(null);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className={`shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px] ${
                  selectedUser ? 'pr-10' : ''
                }`}
                placeholder="Search by name or email..."
                autoComplete="off"
              />
              {selectedUser && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {isLoadingUsers ? 'Loading users...' : 'Type at least 2 characters to search'}
            </p>

            {/* Suggestions Dropdown */}
            {showSuggestions && searchQuery.length >= 2 && filteredUsers.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
              >
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectUser(user)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                  >
                    {/* Avatar with initials */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                      {getInitials(user.firstName, user.lastName)}
                    </div>
                    {/* Name and email */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {getDisplayName(user)}
                      </div>
                      {user.email && (
                        <div className="text-sm text-gray-500 truncate">
                          {user.email}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* No results message */}
            {showSuggestions && searchQuery.length >= 2 && filteredUsers.length === 0 && !isLoadingUsers && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg p-4 text-center text-sm text-gray-500"
              >
                No users found matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>

          {/* Selected User Display */}
          {selectedUser && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-sm font-medium text-blue-700">
                {getInitials(selectedUser.firstName, selectedUser.lastName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {getDisplayName(selectedUser)}
                </div>
                {selectedUser.email && (
                  <div className="text-sm text-gray-600">{selectedUser.email}</div>
                )}
              </div>
              <svg className="h-5 w-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                    role === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={role === option.value}
                    onChange={() => setRole(option.value)}
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
            disabled={loading || !selectedUser}
            className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {loading ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
