'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import Button from '@/components/ui/Button';
import { PreviewActions } from '../shared/PreviewActions';

interface LandingHeroProps {
  courseId: string;
  title: string;
  description: string;
  sectionCount: number;
  lessonCount: number;
  onStart: () => void;
}

export function LandingHero({
  courseId,
  title,
  description,
  sectionCount,
  lessonCount,
  onStart,
}: LandingHeroProps) {
  const router = useRouter();

  return (
    <div className="min-h-[70vh] flex flex-col">
      {/* Top navigation */}
      <div className="flex items-center justify-between p-4 md:p-6">
        <button
          onClick={() => router.push(`/course/${courseId}/editor`)}
          className="flex items-center gap-2 text-secondary hover:text-primary transition-colors min-h-[44px] px-2"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Back to Editor</span>
        </button>
        <PreviewActions courseId={courseId} variant="icon" />
      </div>

      {/* Hero content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        {/* Icon */}
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-8">
          <BookOpen className="w-10 h-10 md:w-12 md:h-12 text-primary-600 dark:text-primary-400" />
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary tracking-tight max-w-4xl mb-6">
          {title}
        </h1>

        {/* Description */}
        {description && (
          <p className="text-lg md:text-xl text-secondary max-w-2xl mb-8">
            {description}
          </p>
        )}

        {/* Start button */}
        <Button
          variant="primary"
          size="lg"
          onClick={onStart}
          className="px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl"
        >
          Start Course
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>

        {/* Stats */}
        <p className="text-sm text-muted mt-6">
          {sectionCount} section{sectionCount !== 1 ? 's' : ''} • {lessonCount} lesson{lessonCount !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
