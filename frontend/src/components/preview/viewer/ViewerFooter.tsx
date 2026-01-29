'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';

interface ViewerFooterProps {
  currentIndex: number;
  totalLessons: number;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function ViewerFooter({
  currentIndex,
  totalLessons,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: ViewerFooterProps) {
  return (
    <footer className="bg-surface border-t px-4 py-4">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
        {/* Previous button */}
        <Button
          variant="secondary"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="min-w-[120px]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>

        {/* Lesson counter */}
        <span className="text-sm text-muted">
          Lesson {currentIndex + 1} of {totalLessons}
        </span>

        {/* Next button */}
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!hasNext}
          className="min-w-[120px]"
        >
          Next
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </footer>
  );
}
