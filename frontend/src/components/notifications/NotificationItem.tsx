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
  0: { icon: '📋', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  1: { icon: '📝', color: 'text-blue-600', bgColor: 'bg-blue-100' }, // TASK_ASSIGNED
  2: { icon: '⏰', color: 'text-amber-600', bgColor: 'bg-amber-100' }, // TASK_DUE_SOON
  3: { icon: '✅', color: 'text-green-600', bgColor: 'bg-green-100' }, // INGESTION_COMPLETE
  4: { icon: '❌', color: 'text-red-600', bgColor: 'bg-red-100' }, // INGESTION_FAILED
  5: { icon: '📄', color: 'text-purple-600', bgColor: 'bg-purple-100' }, // OUTLINE_READY
  6: { icon: '🎉', color: 'text-green-600', bgColor: 'bg-green-100' }, // GENERATION_COMPLETE
  7: { icon: '⚠️', color: 'text-red-600', bgColor: 'bg-red-100' }, // GENERATION_FAILED
  8: { icon: '👀', color: 'text-indigo-600', bgColor: 'bg-indigo-100' }, // APPROVAL_REQUESTED
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
      router.push(notification.actionUrl);
    }
  };

  return (
    <div
      className={`
        relative p-4 hover:bg-gray-50 cursor-pointer transition-colors
        ${!isRead ? 'bg-blue-50/50' : ''}
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
            <p className={`text-sm font-medium ${isRead ? 'text-gray-700' : 'text-gray-900'}`}>
              {notification.title}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!isRead && (
                <span className="w-2 h-2 rounded-full bg-blue-500" title="Unread" />
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 rounded"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <p className={`mt-1 text-sm ${isRead ? 'text-gray-500' : 'text-gray-600'} line-clamp-2`}>
            {notification.message}
          </p>

          <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
            {notification.createdAt && (
              <span>{getRelativeTime(notification.createdAt)}</span>
            )}
            {notification.actionUrl && (
              <span className="text-blue-500 hover:text-blue-700">View details →</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
