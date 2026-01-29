'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Menu } from 'lucide-react';
import { ProgressBar } from '../shared/ProgressBar';
import { PreviewActions } from '../shared/PreviewActions';

interface ViewerHeaderProps {
  courseId: string;
  courseTitle: string;
  sectionTitle: string;
  lessonTitle: string;
  lessonId: string;
  progressPercent: number;
  onMenuClick?: () => void;
  showMenu?: boolean;
}

export function ViewerHeader({
  courseId,
  courseTitle,
  sectionTitle,
  lessonTitle,
  lessonId,
  progressPercent,
  onMenuClick,
  showMenu = false,
}: ViewerHeaderProps) {
  const router = useRouter();

  return (
    <header className="bg-surface border-b sticky top-0 z-20">
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        {/* Left: Back/Menu and breadcrumb */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {showMenu ? (
            <button
              onClick={onMenuClick}
              className="p-2 -ml-2 rounded-lg hover:bg-hover transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center md:hidden"
            >
              <Menu className="w-5 h-5 text-secondary" />
            </button>
          ) : null}

          <button
            onClick={() => router.push(`/preview/${courseId}`)}
            className="hidden md:flex items-center gap-2 text-secondary hover:text-primary transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-5 h-5 flex-shrink-0" />
            <span className="truncate">{courseTitle}</span>
          </button>

          {/* Mobile breadcrumb */}
          <div className="md:hidden min-w-0">
            <p className="text-xs text-muted truncate">{sectionTitle}</p>
            <p className="text-sm font-medium text-primary truncate">{lessonTitle}</p>
          </div>
        </div>

        {/* Center: Progress (desktop only) */}
        <div className="hidden md:flex items-center gap-4 flex-shrink-0">
          <ProgressBar percent={progressPercent} showLabel size="sm" className="w-40" />
        </div>

        {/* Right: Actions */}
        <PreviewActions courseId={courseId} lessonId={lessonId} variant="icon" />
      </div>

      {/* Mobile progress bar */}
      <div className="md:hidden px-4 pb-2">
        <ProgressBar percent={progressPercent} size="sm" />
      </div>
    </header>
  );
}
