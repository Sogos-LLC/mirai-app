'use client';

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BookOpen } from 'lucide-react';
import ProfileDropdown from '@/components/auth/ProfileDropdown';
import { checkSession, selectIsAuthInitialized } from '@/store/slices/authSlice';
import type { AppDispatch } from '@/store';

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthInitialized = useSelector(selectIsAuthInitialized);

  // Check session on mount
  useEffect(() => {
    if (!isAuthInitialized) {
      dispatch(checkSession());
    }
  }, [dispatch, isAuthInitialized]);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo / Brand */}
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-indigo-600" />
          <span className="text-lg font-semibold text-gray-900">
            {title || 'Mirai'}
          </span>
        </div>

        {/* Profile Dropdown */}
        <ProfileDropdown />
      </div>
    </header>
  );
}
