'use client';

import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import { ExportButton } from './ExportButton';

interface PreviewActionsProps {
  courseId: string;
  variant?: 'icon' | 'full';
  className?: string;
}

export function PreviewActions({
  courseId,
  variant = 'full',
  className = '',
}: PreviewActionsProps) {
  const router = useRouter();

  const handleEdit = () => {
    router.push(`/course/${courseId}/editor`);
  };

  if (variant === 'icon') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={handleEdit}
          className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-hover transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          title="Edit course"
        >
          <Pencil className="w-5 h-5" />
        </button>
        <ExportButton courseId={courseId} variant="icon" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Button variant="secondary" size="sm" onClick={handleEdit}>
        <Pencil className="w-4 h-4 mr-2" />
        Edit
      </Button>
      <ExportButton courseId={courseId} variant="full" />
    </div>
  );
}
