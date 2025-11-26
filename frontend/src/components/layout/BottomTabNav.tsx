'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Library,
  Plus,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useBreakpoint';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Special styling for create button */
  isCreate?: boolean;
}

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    href: '/content-library',
    label: 'Library',
    icon: <Library className="w-5 h-5" />,
  },
  {
    href: '/course-builder',
    label: 'Create',
    icon: <Plus className="w-6 h-6" />,
    isCreate: true,
  },
  {
    href: '/templates',
    label: 'Templates',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    href: '/settings',
    label: 'More',
    icon: <MoreHorizontal className="w-5 h-5" />,
  },
];

export function BottomTabNav() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  // Only render on mobile
  if (!isMobile) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 safe-area-bottom"
      style={{ height: 'calc(var(--bottom-nav-height) + var(--safe-area-bottom))' }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          if (item.isCreate) {
            // Special create button styling
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center -mt-4"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors">
                  {item.icon}
                </div>
                <span className="text-xs mt-1 text-gray-600">{item.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center justify-center
                min-w-[64px] py-2 px-3
                transition-colors
                ${isActive
                  ? 'text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <div className={`
                flex items-center justify-center w-6 h-6
                ${isActive ? 'text-primary-600' : ''}
              `}>
                {item.icon}
              </div>
              <span className={`
                text-xs mt-1
                ${isActive ? 'font-medium' : ''}
              `}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomTabNav;
