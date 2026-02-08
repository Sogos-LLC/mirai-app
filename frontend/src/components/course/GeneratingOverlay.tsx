import { Loader2, Sparkles } from 'lucide-react';

interface GeneratingOverlayProps {
  title: string;
  message: string;
  onCancel?: () => void;
}

export function GeneratingOverlay({ title, message, onCancel }: GeneratingOverlayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Pulsing icon */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 bg-indigo-100 dark:bg-indigo-900/30 rounded-full animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>

      {/* Title with spinner */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
        <h3 className="text-lg sm:text-xl font-bold text-primary">{title}</h3>
      </div>

      <p className="text-sm sm:text-base text-secondary max-w-md mb-8">{message}</p>

      {/* Bouncing dots */}
      <div className="flex justify-center gap-2 mb-6">
        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="text-sm text-muted hover:text-primary transition-colors underline min-h-[44px]"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
