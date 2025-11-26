'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { toggleSidebar, closeMobileSidebar } from '@/store/slices/uiSlice';
import { prefetchFolders, prefetchCourses } from '@/store/slices/courseSlice';
import { useIsMobile } from '@/hooks/useBreakpoint';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Settings,
  HelpCircle,
  Bell,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// Export navigation items for reuse in mobile components
export const menuItems = [
  { icon: LayoutDashboard, label: 'Content Library', path: '/content-library' },
  { icon: FileText, label: 'Templates', path: '/templates' },
  { icon: BookOpen, label: 'Tutorials', path: '/tutorials' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export const recentItems = [
  { label: 'Team Folder 1', path: '/folder/team-1' },
  { label: 'Team Folder 2', path: '/folder/team-2' },
];

export const bottomItems = [
  { icon: HelpCircle, label: 'Help and Support', path: '/help' },
  { icon: Bell, label: 'Product Updates', path: '/updates' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { sidebarOpen, mobileSidebarOpen } = useSelector((state: RootState) => state.ui);
  const [showText, setShowText] = useState(sidebarOpen);
  const isMobile = useIsMobile();

  // Track which paths have already been prefetched
  const prefetchedPaths = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (sidebarOpen) {
      const timer = setTimeout(() => setShowText(true), 50);
      return () => clearTimeout(timer);
    } else {
      setShowText(false);
    }
  }, [sidebarOpen]);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile && mobileSidebarOpen) {
      dispatch(closeMobileSidebar());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Prefetch handler for aggressive hover prefetching
  const handlePrefetch = (path: string) => {
    // Skip if already prefetched
    if (prefetchedPaths.current.has(path)) {
      return;
    }

    // Mark as prefetched
    prefetchedPaths.current.add(path);

    // Prefetch Next.js route
    router.prefetch(path);

    // Prefetch API data based on the route
    switch (path) {
      case '/dashboard':
        // Dashboard needs courses list
        dispatch(prefetchCourses());
        break;
      case '/content-library':
        // Content library needs folders and courses
        dispatch(prefetchFolders(true));
        dispatch(prefetchCourses());
        break;
      // Templates, Tutorials, Settings, Help, Updates don't need API data (static pages)
      // Team folders could prefetch folder-specific data in the future
      default:
        // Just prefetch the Next.js route (already done above)
        break;
    }
  };

  // Build sidebar classes
  // device-mobile class triggers mobile-specific styles (drawer behavior)
  const sidebarClasses = [
    'sidebar',
    isMobile && 'device-mobile',
    !sidebarOpen && !isMobile && 'collapsed',
    mobileSidebarOpen && 'mobile-open',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Mobile device backdrop */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 animate-backdrop-in"
          onClick={() => dispatch(closeMobileSidebar())}
          aria-hidden="true"
        />
      )}

      <aside className={sidebarClasses}>
        <Link
        href="/dashboard"
        className="sidebar-header cursor-pointer"
        prefetch={true}
        onMouseEnter={() => handlePrefetch('/dashboard')}
      >
        <div className="sidebar-avatar">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <span className={`sidebar-brand ${showText ? 'animate-fadeIn' : 'animate-fadeOut'}`}>
          Mirai
        </span>
      </Link>

      <button
        onClick={() => dispatch(toggleSidebar())}
        className="sidebar-toggle"
      >
        {sidebarOpen ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      <nav className="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <Link
              key={item.path}
              href={item.path}
              className={`menu-item ${isActive ? 'active' : ''}`}
              prefetch={true}
              onMouseEnter={() => handlePrefetch(item.path)}
            >
              <Icon className="menu-icon" />
              <span className={`menu-label ${showText ? 'animate-fadeIn' : 'animate-fadeOut'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {showText && (
          <div className={`sidebar-recents ${showText ? 'animate-fadeIn' : 'animate-fadeOut'}`}>
            <h3 className="recents-title">Recents</h3>
            {recentItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className="recent-item"
                prefetch={true}
                onMouseEnter={() => handlePrefetch(item.path)}
              >
                <div className="recent-dot" />
                <span className="menu-label">{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="sidebar-bottom">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              className="menu-item"
              prefetch={true}
              onMouseEnter={() => handlePrefetch(item.path)}
            >
              <Icon className="menu-icon" />
              <span className={`menu-label ${showText ? 'animate-fadeIn' : 'animate-fadeOut'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
    </>
  );
}
