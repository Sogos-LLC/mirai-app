'use client';

import React from 'react';
import { CheckCircle2, Clock, Users, X } from 'lucide-react';

interface GapTaskResumeBannerProps {
  totalTasks: number;
  completedTasks: number;
  onDismiss?: () => void;
}

export function GapTaskResumeBanner({
  totalTasks,
  completedTasks,
  onDismiss,
}: GapTaskResumeBannerProps) {
  const allCompleted = completedTasks >= totalTasks;
  const noneCompleted = completedTasks === 0;

  const config = allCompleted
    ? {
        bg: 'bg-green-50 dark:bg-green-900/20',
        border: 'border-green-200 dark:border-green-800',
        iconColor: 'text-green-600 dark:text-green-400',
        textColor: 'text-green-800 dark:text-green-200',
        subtextColor: 'text-green-600 dark:text-green-400',
        Icon: CheckCircle2,
        title: `All ${totalTasks} knowledge gap tasks completed!`,
        subtitle: 'Your team has addressed all identified gaps. Review your course setup and continue.',
      }
    : noneCompleted
      ? {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          iconColor: 'text-blue-600 dark:text-blue-400',
          textColor: 'text-blue-800 dark:text-blue-200',
          subtextColor: 'text-blue-600 dark:text-blue-400',
          Icon: Users,
          title: `Your team is working on ${totalTasks} knowledge gap tasks.`,
          subtitle: 'You can continue now or wait for tasks to be completed.',
        }
      : {
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-amber-200 dark:border-amber-800',
          iconColor: 'text-amber-600 dark:text-amber-400',
          textColor: 'text-amber-800 dark:text-amber-200',
          subtextColor: 'text-amber-600 dark:text-amber-400',
          Icon: Clock,
          title: `${completedTasks} of ${totalTasks} gap tasks completed.`,
          subtitle: 'Some gaps are still being addressed. You can continue now or wait.',
        };

  return (
    <div className={`mb-6 flex items-start gap-3 px-4 py-3 ${config.bg} border ${config.border} rounded-lg`}>
      <config.Icon className={`w-5 h-5 ${config.iconColor} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${config.textColor}`}>{config.title}</p>
        <p className={`text-xs ${config.subtextColor} mt-0.5`}>{config.subtitle}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`${config.subtextColor} hover:opacity-70 shrink-0`}
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
