'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, RotateCcw, PenSquare } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ExportButton } from '@/components/preview/shared/ExportButton';
import Button from '@/components/ui/Button';

interface CourseCompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  totalLessons: number;
  totalSections: number;
  onRestart: () => void;
}

function triggerConfetti() {
  const defaults = {
    spread: 360,
    ticks: 100,
    gravity: 0.5,
    decay: 0.94,
    startVelocity: 30,
    colors: ['#10b981', '#34d399', '#6ee7b7', '#4f46e5', '#f59e0b'],
  };

  confetti({
    ...defaults,
    particleCount: 100,
    origin: { x: 0.5, y: 0.5 },
  });

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 50,
      origin: { x: 0.25, y: 0.6 },
    });
  }, 150);

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 50,
      origin: { x: 0.75, y: 0.6 },
    });
  }, 300);
}

export function CourseCompleteModal({
  isOpen,
  onClose,
  courseId,
  courseTitle,
  totalLessons,
  totalSections,
  onRestart,
}: CourseCompleteModalProps) {
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      triggerConfetti();
    }
  }, [isOpen]);

  const handleRestart = () => {
    onRestart();
    onClose();
  };

  const handleOpenEditor = () => {
    router.push(`/course/${courseId}/editor`);
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Course Complete!"
      size="md"
      mobileHeight="auto"
    >
      <div className="text-center py-4">
        {/* Trophy icon */}
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
          <Trophy className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
        </div>

        <h3 className="text-2xl font-bold text-primary mb-2">
          Congratulations!
        </h3>
        <p className="text-secondary mb-6">
          You&apos;ve completed <span className="font-semibold">{courseTitle}</span>
        </p>

        {/* Course stats */}
        <div className="flex justify-center gap-8 mb-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {totalLessons}
            </div>
            <div className="text-xs text-muted">
              {totalLessons === 1 ? 'Lesson' : 'Lessons'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {totalSections}
            </div>
            <div className="text-xs text-muted">
              {totalSections === 1 ? 'Section' : 'Sections'}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            onClick={handleRestart}
            className="w-full min-h-[44px] justify-center"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Restart Course
          </Button>

          <Button
            variant="secondary"
            onClick={handleOpenEditor}
            className="w-full min-h-[44px] justify-center"
          >
            <PenSquare className="w-4 h-4 mr-2" />
            Open in Editor
          </Button>

          <ExportButton courseId={courseId} variant="full" className="w-full" />
        </div>
      </div>
    </ResponsiveModal>
  );
}
