'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUIStore } from '@/store/zustand';
import { useIsMobile } from '@/hooks/useBreakpoint';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  HelpCircle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { useIsAdmin } from '@/hooks/useCurrentUser';

// Base navigation items (always visible)
export const menuItems = [
  { icon: LayoutDashboard, label: 'Content Library', path: '/content-library' },
  { icon: FileText, label: 'Templates', path: '/templates' },
  { icon: BookOpen, label: 'Tutorials', path: '/tutorials' },
];

// Admin-only navigation items
export const adminMenuItems = [
  { icon: Building2, label: 'Teams', path: '/teams' },
];

export const bottomItems = [
  { icon: HelpCircle, label: 'Help and Support', path: '/help' },
  { icon: Bell, label: 'Product Updates', path: '/updates' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const mobileSidebarOpen = useUIStore((s) => s.mobileSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar);
  const [showText, setShowText] = useState(sidebarOpen);
  const isMobile = useIsMobile();
  const { isAdmin } = useIsAdmin();

  // Combine menu items based on user role
  const visibleMenuItems = isAdmin
    ? [...menuItems, ...adminMenuItems]
    : menuItems;

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
      closeMobileSidebar();
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
          onClick={closeMobileSidebar}
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
          onClick={toggleSidebar}
          className="sidebar-toggle"
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <nav className="sidebar-menu">
          {visibleMenuItems.map((item) => {
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
