'use client';

import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/zustand';
import type { Notification } from '@/gen/mirai/v1/notification_pb';
import type { GenerationJob } from '@/gen/mirai/v1/ai_generation_types_pb';
import { NotificationItem } from './NotificationItem';
import { ActiveJobItem } from './ActiveJobItem';

interface NotificationPanelProps {
  notifications: Notification[];
  isLoading?: boolean;
  hasMore?: boolean;
  activeJobs?: GenerationJob[];
  onCancelJob?: (jobId: string) => Promise<void>;
  onLoadMore?: () => void;
  onMarkAsRead?: (ids: string[]) => void;
  onMarkAllAsRead?: () => void;
  onDelete?: (id: string) => void;
}

export function NotificationPanel({
  notifications,
  isLoading = false,
  hasMore = false,
  activeJobs = [],
  onCancelJob,
  onLoadMore,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const { isPanelOpen, showUnreadOnly, locallyReadIds } = useUIStore((s) => s.notification);
  const closeNotificationPanel = useUIStore((s) => s.closeNotificationPanel);
  const setShowUnreadOnly = useUIStore((s) => s.setShowUnreadOnly);
  const markLocallyRead = useUIStore((s) => s.markLocallyRead);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // Check if click was on the bell button
        const bellButton = (event.target as Element).closest('[aria-label*="Notifications"]');
        if (!bellButton) {
          closeNotificationPanel();
        }
      }
    };

    if (isPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPanelOpen, closeNotificationPanel]);

  // Filter notifications
  const filteredNotifications = showUnreadOnly
    ? notifications.filter((n) => !n.read && !locallyReadIds.includes(n.id))
    : notifications;

  const unreadCount = notifications.filter(
    (n) => !n.read && !locallyReadIds.includes(n.id)
  ).length;

  const handleMarkAsRead = (id: string) => {
    markLocallyRead([id]);
    onMarkAsRead?.([id]);
  };

  const handleMarkAllAsRead = () => {
    const unreadIds = notifications
      .filter((n) => !n.read && !locallyReadIds.includes(n.id))
      .map((n) => n.id);
    markLocallyRead(unreadIds);
    onMarkAllAsRead?.();
  };

  if (!isPanelOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-96 max-h-[80vh] bg-white dark:bg-dark-surface-elevated rounded-lg shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-dark-border overflow-hidden z-50"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h3>
          <button
            onClick={closeNotificationPanel}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter & Actions */}
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
              className="mr-2 h-4 w-4 text-primary-600 dark:text-primary-400 rounded focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-dark-400 border-gray-300 dark:border-dark-border"
            />
            Unread only
          </label>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Active Jobs Section */}
      {activeJobs.length > 0 && (
        <div className="border-b border-gray-200 dark:border-dark-border">
          <div className="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-100 dark:border-primary-800/30">
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wide">
              Active Jobs
            </span>
          </div>
          {activeJobs.map((job) => (
            <ActiveJobItem
              key={job.id}
              job={job}
              onCancel={onCancelJob}
            />
          ))}
        </div>
      )}

      {/* Notification List */}
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
        {isLoading && notifications.length === 0 && activeJobs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400" />
          </div>
        ) : filteredNotifications.length > 0 ? (
          <>
            {filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={() => handleMarkAsRead(notification.id)}
                onDelete={onDelete ? () => onDelete(notification.id) : undefined}
                isLocallyRead={locallyReadIds.includes(notification.id)}
              />
            ))}
            {hasMore && (
              <div className="p-4">
                <button
                  onClick={onLoadMore}
                  disabled={isLoading}
                  className="w-full py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 disabled:opacity-50"
                >
                  {isLoading ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        ) : activeJobs.length === 0 ? (
          <div className="py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-300 dark:text-dark-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500 dark:text-dark-text-muted">
              {showUnreadOnly ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      {filteredNotifications.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface">
          <button
            onClick={() => {
              closeNotificationPanel();
              // Navigate to notifications page if it exists
            }}
            className="w-full text-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
