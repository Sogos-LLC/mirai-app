'use client';

import React from 'react';
import { useDispatch } from 'react-redux';
import { Menu, BookOpen } from 'lucide-react';
import ProfileDropdown from '@/components/auth/ProfileDropdown';
import { toggleMobileSidebar } from '@/store/slices/uiSlice';
import { useIsMobile } from '@/hooks/useBreakpoint';

interface MobileHeaderProps {
  title?: string;
}

export function MobileHeader({ title }: MobileHeaderProps) {
  const dispatch = useDispatch();
  const isMobile = useIsMobile();

  // Only render on mobile
  if (!isMobile) return null;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 safe-area-top"
      style={{ height: 'calc(var(--header-height) + var(--safe-area-top))' }}
    >
      <div className="flex items-center justify-between h-16 px-4">
        {/* Hamburger Menu Button */}
        <button
          onClick={() => dispatch(toggleMobileSidebar())}
          className="touch-target flex items-center justify-center p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Logo / Brand */}
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          <span className="text-base font-semibold text-gray-900">
            {title || 'Mirai'}
          </span>
        </div>

        {/* Profile Dropdown */}
        <div className="-mr-2">
          <ProfileDropdown />
        </div>
      </div>
    </header>
  );
}

export default MobileHeader;
