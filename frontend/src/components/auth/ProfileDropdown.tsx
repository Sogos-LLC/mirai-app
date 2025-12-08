'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { User, Settings, LogOut, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts';
import { useLogout } from '@/hooks/useLogout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { roleToDisplayString, getRoleBadgeColor } from '@/lib/proto/display';

interface ProfileDropdownProps {
  /** When true, never shows Sign In link - for protected pages */
  isProtectedPage?: boolean;
}

export default function ProfileDropdown({ isProtectedPage = false }: ProfileDropdownProps) {
  const { user, isAuthenticated, isInitialized } = useAuth();
  const { startLogout, isLoggingOut } = useLogout();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get user role from backend
  const { user: backendUser } = useCurrentUser();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle logout using state machine
  const handleLogout = () => {
    setIsOpen(false);
    startLogout();
  };

  // On protected pages, show loading skeleton while auth initializes
  if (isProtectedPage) {
    if (!isInitialized || !user) {
      return (
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-dark-50 animate-pulse" />
          <div className="hidden sm:block w-20 h-4 bg-slate-200 dark:bg-dark-50 rounded animate-pulse" />
        </div>
      );
    }
  } else if (!isAuthenticated || !user) {
    // On public pages, show Sign In link
    return (
      <Link
        href="/auth/login"
        className="text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-gray-100 font-medium transition-colors"
      >
        Sign In
      </Link>
    );
  }

  const displayName = user.traits?.name
    ? `${user.traits.name.first} ${user.traits.name.last}`
    : user.traits?.email || 'User';

  const initials = user.traits?.name
    ? `${user.traits.name.first[0]}${user.traits.name.last[0]}`.toUpperCase()
    : user.traits?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-50 transition-colors"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-medium">
          {initials}
        </div>
        {/* Name (hidden on small screens) */}
        <span className="hidden sm:block text-sm font-medium text-slate-700 dark:text-gray-300 max-w-32 truncate">
          {displayName}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 dark:text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-surface-elevated rounded-lg shadow-lg border border-slate-200 dark:border-dark-border py-1 z-50">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-dark-border">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">
                {displayName}
              </p>
              {backendUser && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${getRoleBadgeColor(backendUser.role)}`}>
                  {roleToDisplayString(backendUser.role)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-gray-400 truncate">{user.traits?.email}</p>
            {user.traits?.company?.name && (
              <p className="text-xs text-slate-400 dark:text-gray-500 truncate mt-1">
                {user.traits.company.name}
              </p>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/auth/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-dark-50 transition-colors"
            >
              <User className="h-4 w-4 text-slate-400 dark:text-gray-500" />
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-dark-50 transition-colors"
            >
              <Settings className="h-4 w-4 text-slate-400 dark:text-gray-500" />
              Settings
            </Link>
          </div>

          {/* Logout */}
          <div className="border-t border-slate-100 dark:border-dark-border py-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isLoggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
