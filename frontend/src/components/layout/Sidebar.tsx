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

// Navigation items
export const menuItems = [
  { icon: LayoutDashboard, label: 'Content Library', path: '/content-library' },
  { icon: FileText, label: 'Templates', path: '/templates' },
  { icon: BookOpen, label: 'Tutorials', path: '/tutorials' },
  { icon: Building2, label: 'Teams', path: '/teams' },
];

export const bottomItems = [
  { icon: HelpCircle, label: 'Help and Support', path: '/help' },
  { icon: Bell, label: 'Product Updates', path: '/updates' },
];

function NavLink({ item, isActive, showText }: {
  item: (typeof menuItems)[number];
  isActive?: boolean;
  showText: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
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
}

export default function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const mobileSidebarOpen = useUIStore((s) => s.mobileSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar);
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
          {menuItems.map((item) => (
            <NavLink key={item.path} item={item} isActive={pathname === item.path} showText={showText} />
          ))}
        </nav>

        <div className="sidebar-bottom">
          {bottomItems.map((item) => (
            <NavLink key={item.path} item={item} showText={showText} />
          ))}
        </div>
      </aside>
    </>
  );
}
