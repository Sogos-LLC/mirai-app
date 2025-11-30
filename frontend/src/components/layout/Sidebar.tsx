'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { toggleSidebar, closeMobileSidebar } from '@/store/slices/uiSlice';
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

// Export navigation items for reuse in prefetching and mobile components
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
  const dispatch = useDispatch();
  const { sidebarOpen, mobileSidebarOpen } = useSelector((state: RootState) => state.ui);
  const [showText, setShowText] = useState(sidebarOpen);
  const isMobile = useIsMobile();

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
        <Link href="/dashboard" prefetch={true} className="sidebar-header cursor-pointer">
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
                prefetch={true}
                className={`menu-item ${isActive ? 'active' : ''}`}
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
                  prefetch={true}
                  className="recent-item"
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
                prefetch={true}
                className="menu-item"
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
