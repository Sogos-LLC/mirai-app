'use client';

import { useRouter } from 'next/navigation';
import type { Notification, NotificationType, NotificationPriority } from '@/gen/mirai/v1/notification_pb';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead?: () => void;
  onDelete?: () => void;
  isLocallyRead?: boolean;
}

const TYPE_CONFIG: Record<number, { icon: string; color: string; bgColor: string }> = {
  0: { icon: '📋', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800/50' },
  1: { icon: '📝', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' }, // TASK_ASSIGNED
  2: { icon: '⏰', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' }, // TASK_DUE_SOON
  3: { icon: '✅', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' }, // INGESTION_COMPLETE
  4: { icon: '❌', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' }, // INGESTION_FAILED
  5: { icon: '📄', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' }, // OUTLINE_READY
  6: { icon: '🎉', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' }, // GENERATION_COMPLETE
  7: { icon: '⚠️', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' }, // GENERATION_FAILED
  8: { icon: '👀', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' }, // APPROVAL_REQUESTED
  9: { icon: '📦', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' }, // EXPORT_COMPLETE
  10: { icon: '⚠️', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' }, // EXPORT_FAILED
};

const PRIORITY_INDICATOR: Record<number, string> = {
  0: '',
  1: '', // LOW
  2: '', // NORMAL
  3: 'border-l-4 border-red-500', // HIGH
};

function getRelativeTime(timestamp: { seconds: bigint }): string {
  const now = Date.now();
  const time = Number(timestamp.seconds) * 1000;
  const diff = now - time;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString();
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  isLocallyRead = false,
}: NotificationItemProps) {
  const router = useRouter();
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG[0];
  const priorityClass = PRIORITY_INDICATOR[notification.priority] || '';
  const isRead = notification.read || isLocallyRead;

  const handleClick = () => {
    if (!isRead && onMarkAsRead) {
      onMarkAsRead();
    }
    if (notification.actionUrl) {
      // Check if external URL (e.g., presigned MinIO download)
      if (notification.actionUrl.startsWith('http://') || notification.actionUrl.startsWith('https://')) {
        window.open(notification.actionUrl, '_blank');
      } else {
        router.push(notification.actionUrl);
      }
    }
  };

  return (
    <div
      className={`
        relative p-4 hover:bg-gray-50 dark:hover:bg-dark-50 cursor-pointer transition-colors
        ${!isRead ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}
        ${priorityClass}
      `}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
          <span className="text-lg">{config.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium ${isRead ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
              {notification.title}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!isRead && (
                <span className="w-2 h-2 rounded-full bg-primary-500" title="Unread" />
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <p className={`mt-1 text-sm ${isRead ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'} line-clamp-2`}>
            {notification.message}
          </p>

          <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 dark:text-dark-text-muted">
            {notification.createdAt && (
              <span>{getRelativeTime(notification.createdAt)}</span>
            )}
            {notification.actionUrl && (
              <span className="text-primary-500 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">View details →</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
