'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@connectrpc/connect-query';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useCreateTask, ContentType } from '@/hooks/useSME';
import { listCompanyUsers } from '@/gen/mirai/v1/user-UserService_connectquery';
import type { User } from '@/gen/mirai/v1/common_pb';

interface CreateTaskModalProps {
  smeId: string;
  smeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const CONTENT_TYPE_OPTIONS = [
  { value: ContentType.TEXT, label: 'Text', description: 'Plain text knowledge' },
  { value: ContentType.DOCUMENT, label: 'Document', description: 'PDF, DOCX, or TXT files' },
  { value: ContentType.IMAGE, label: 'Image', description: 'PNG, JPG, or other images' },
  { value: ContentType.VIDEO, label: 'Video', description: 'MP4, MOV, or other videos' },
  { value: ContentType.AUDIO, label: 'Audio', description: 'MP3, WAV, or other audio' },
  { value: ContentType.URL, label: 'URL', description: 'Web page to scrape' },
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

export function CreateTaskModal({ smeId, smeName, onClose, onSuccess }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState<ContentType>(ContentType.TEXT);
  const [dueDate, setDueDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const createTask = useCreateTask();
  const { data: companyUsersData, isLoading: isLoadingUsers } = useQuery(listCompanyUsers, {});

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!companyUsersData?.users || searchQuery.length < 2) {
      return [];
    }

    const query = searchQuery.toLowerCase();
    return companyUsersData.users.filter((user) => {
      if (selectedUser?.id === user.id) return false;

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
  }, [companyUsersData?.users, searchQuery, selectedUser]);

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

    if (!title.trim()) {
      setError('Please enter a task title');
      return;
    }
    if (!selectedUser) {
      setError('Please select a user to assign the task to');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createTask.mutate({
        smeId,
        title: title.trim(),
        description: description.trim() || undefined,
        expectedContentType: contentType,
        assignedToUserId: selectedUser.id,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create task');
      }
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} title="Assign Knowledge Task">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* SME Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-600">
              Assigning task to SME: <span className="font-medium text-gray-900">{smeName}</span>
            </p>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px]"
              placeholder="e.g., Sales Training Documentation"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-2 border"
              placeholder="Describe what knowledge you need..."
            />
          </div>

          {/* Assignee Search */}
          <div className="relative">
            <label htmlFor="userSearch" className="block text-sm font-medium text-gray-700 mb-1">
              Assign To <span className="text-red-500">*</span>
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
                className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto"
              >
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectUser(user)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                      {getInitials(user.firstName, user.lastName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {getDisplayName(user)}
                      </div>
                      {user.email && (
                        <div className="text-xs text-gray-500 truncate">{user.email}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* No results */}
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
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-xs font-medium text-blue-700">
                {getInitials(selectedUser.firstName, selectedUser.lastName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{getDisplayName(selectedUser)}</div>
                {selectedUser.email && (
                  <div className="text-xs text-gray-600">{selectedUser.email}</div>
                )}
              </div>
              <svg className="h-5 w-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}

          {/* Content Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Expected Content Type</label>
            <div className="grid grid-cols-2 gap-2">
              {CONTENT_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center p-2 border rounded-lg cursor-pointer transition-colors ${
                    contentType === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="contentType"
                    value={option.value}
                    checked={contentType === option.value}
                    onChange={() => setContentType(option.value)}
                    className="sr-only"
                  />
                  <div>
                    <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
              Due Date (optional)
            </label>
            <input
              type="date"
              id="dueDate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 lg:py-2 border min-h-[44px]"
            />
          </div>

          {/* Error */}
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
            disabled={loading || !title.trim() || !selectedUser}
            className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {loading ? 'Creating...' : 'Assign Task'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
