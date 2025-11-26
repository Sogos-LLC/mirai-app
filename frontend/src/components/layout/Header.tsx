'use client';

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BookOpen, Menu } from 'lucide-react';
import ProfileDropdown from '@/components/auth/ProfileDropdown';
import { checkSession, selectIsAuthInitialized } from '@/store/slices/authSlice';
import { toggleMobileSidebar } from '@/store/slices/uiSlice';
import { useIsMobile } from '@/hooks/useBreakpoint';
import type { AppDispatch } from '@/store';

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthInitialized = useSelector(selectIsAuthInitialized);
  const isMobile = useIsMobile();

  // Check session on mount
  useEffect(() => {
    if (!isAuthInitialized) {
      dispatch(checkSession());
    }
  }, [dispatch, isAuthInitialized]);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Hamburger menu (mobile devices only) */}
        {isMobile && (
          <button
            onClick={() => dispatch(toggleMobileSidebar())}
            className="touch-target flex items-center justify-center p-2 -ml-2 mr-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        )}

        {/* Logo / Brand */}
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 lg:h-6 lg:w-6 text-indigo-600" />
          <span className="text-base lg:text-lg font-semibold text-gray-900">
            {title || 'Mirai'}
          </span>
        </div>

        {/* Profile Dropdown */}
        <ProfileDropdown />
      </div>
    </header>
  );
}
