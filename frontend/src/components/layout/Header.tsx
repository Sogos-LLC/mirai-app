'use client';

import React from 'react';
import { BookOpen, Menu } from 'lucide-react';
import ProfileDropdown from '@/components/auth/ProfileDropdown';
import { useUIStore } from '@/store/zustand';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import {
  useUnreadCount,
  useListNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDeleteNotification,
} from '@/hooks/useNotifications';
import { useNotificationStream } from '@/hooks/useNotificationStream';
import { useActiveGenerationJobs, useCancelJob } from '@/hooks/useAIGeneration';

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar);
  const isMobile = useIsMobile();

  // Establish real-time notification streaming connection
  useNotificationStream();

  // Notification hooks (RTK Query / Connect Query)
  const { count: unreadCount } = useUnreadCount();
  const { data: notifications, isLoading: notificationsLoading } = useListNotifications({ limit: 20 });
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteNotification = useDeleteNotification();

  // Active generation jobs (shown in notification panel)
  const { data: activeJobs, refetch: refetchJobs } = useActiveGenerationJobs();
  const cancelJob = useCancelJob();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Hamburger menu (mobile devices only) */}
        {isMobile && (
          <button
            onClick={toggleMobileSidebar}
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

        {/* Notifications & Profile */}
        <div className="flex items-center gap-2">
          {/* Notification Bell with Panel (active jobs shown inside panel) */}
          <div className="relative">
            <NotificationBell unreadCount={unreadCount} />
            <NotificationPanel
              notifications={notifications}
              isLoading={notificationsLoading}
              activeJobs={activeJobs}
              onCancelJob={async (jobId) => {
                await cancelJob.mutate(jobId);
                await refetchJobs();
              }}
              onMarkAsRead={(ids) => markAsRead.mutate(ids)}
              onMarkAllAsRead={() => markAllAsRead.mutate()}
              onDelete={(id) => deleteNotification.mutate(id)}
            />
          </div>

          {/* Profile Dropdown */}
          <ProfileDropdown isProtectedPage />
        </div>
      </div>
    </header>
  );
}
