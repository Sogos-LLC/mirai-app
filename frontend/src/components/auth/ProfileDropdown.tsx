'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useDispatch, useSelector } from 'react-redux';
import { User, Settings, LogOut, ChevronDown } from 'lucide-react';
import { logout, selectUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store';

export default function ProfileDropdown() {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector(selectUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Handle logout
  const handleLogout = async () => {
    setIsOpen(false);
    await dispatch(logout());
    // Redirect to landing page after logout
    window.location.href = '/';
  };

  if (!isAuthenticated || !user) {
    return (
      <Link
        href="/auth/login"
        className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
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
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-medium">
          {initials}
        </div>
        {/* Name (hidden on small screens) */}
        <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-32 truncate">
          {displayName}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-900 truncate">
              {displayName}
            </p>
            <p className="text-xs text-slate-500 truncate">{user.traits?.email}</p>
            {user.traits?.company?.name && (
              <p className="text-xs text-slate-400 truncate mt-1">
                {user.traits.company.name}
              </p>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/auth/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <User className="h-4 w-4 text-slate-400" />
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              Settings
            </Link>
          </div>

          {/* Logout */}
          <div className="border-t border-slate-100 py-1">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
