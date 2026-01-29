'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useUIStore } from '@/store/zustand';

export function FeedbackButton() {
  const openFeedbackModal = useUIStore((s) => s.openFeedbackModal);

  return (
    <button
      onClick={openFeedbackModal}
      className="relative p-2 rounded-full transition-colors text-secondary hover:text-primary hover:bg-hover"
      aria-label="Send feedback"
      title="Send feedback"
    >
      <MessageSquarePlus className="w-6 h-6" />
    </button>
  );
}
