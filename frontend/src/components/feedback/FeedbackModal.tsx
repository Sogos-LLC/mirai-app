'use client';

import { useState } from 'react';
import { Bug, Lightbulb, MessageCircle, Check, Loader2 } from 'lucide-react';
import { useUIStore } from '@/store/zustand';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import Button from '@/components/ui/Button';
import { useSubmitFeedback, FeedbackType } from '@/hooks/useFeedback';

interface FeedbackTypeOption {
  type: FeedbackType;
  label: string;
  icon: typeof Bug;
  description: string;
}

const feedbackTypes: FeedbackTypeOption[] = [
  {
    type: FeedbackType.BUG_REPORT,
    label: 'Bug Report',
    icon: Bug,
    description: 'Something is broken or not working',
  },
  {
    type: FeedbackType.FEATURE_REQUEST,
    label: 'Feature Request',
    icon: Lightbulb,
    description: 'Suggest a new feature or improvement',
  },
  {
    type: FeedbackType.GENERAL,
    label: 'General Feedback',
    icon: MessageCircle,
    description: 'Share any other thoughts',
  },
];

export function FeedbackModal() {
  const isOpen = useUIStore((s) => s.feedback.isModalOpen);
  const closeFeedbackModal = useUIStore((s) => s.closeFeedbackModal);

  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const { mutate: submitFeedback, isLoading, error, reset } = useSubmitFeedback();

  const handleClose = () => {
    closeFeedbackModal();
    // Reset state after animation completes
    setTimeout(() => {
      setSelectedType(null);
      setMessage('');
      setShowSuccess(false);
      reset();
    }, 300);
  };

  const handleSubmit = async () => {
    if (!selectedType || message.length < 10) return;

    try {
      await submitFeedback({
        type: selectedType,
        message,
      });
      setShowSuccess(true);
      // Auto-close after showing success
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch {
      // Error is handled by the hook
    }
  };

  const canSubmit = selectedType !== null && message.length >= 10 && !isLoading;

  // Success state
  if (showSuccess) {
    return (
      <ResponsiveModal
        isOpen={isOpen}
        onClose={handleClose}
        title="Feedback Sent"
        size="sm"
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-medium text-primary mb-2">Thank you!</h3>
          <p className="text-secondary">Your feedback has been submitted.</p>
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Send Feedback"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Feedback'
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Feedback Type Selection */}
        <div>
          <label className="block text-sm font-medium text-primary mb-3">
            What type of feedback do you have?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {feedbackTypes.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedType === option.type;
              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => setSelectedType(option.type)}
                  className={`
                    flex flex-col items-center p-4 rounded-xl border-2 transition-all
                    ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-DEFAULT hover:border-primary-300 dark:hover:border-primary-700 bg-surface hover:bg-hover'
                    }
                  `}
                >
                  <Icon
                    className={`w-6 h-6 mb-2 ${
                      isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-secondary'
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-primary'
                    }`}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Input */}
        <div>
          <label
            htmlFor="feedback-message"
            className="block text-sm font-medium text-primary mb-2"
          >
            Your feedback
          </label>
          <textarea
            id="feedback-message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Please describe your feedback in detail..."
            className={`
              w-full px-4 py-3 rounded-xl border transition-colors resize-none
              bg-surface text-primary placeholder-muted
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
              ${message.length > 0 && message.length < 10 ? 'border-red-300 dark:border-red-700' : 'border-DEFAULT'}
            `}
            maxLength={2000}
          />
          <div className="flex justify-between items-center mt-2">
            <span
              className={`text-xs ${
                message.length > 0 && message.length < 10
                  ? 'text-red-500'
                  : 'text-muted'
              }`}
            >
              {message.length > 0 && message.length < 10
                ? `${10 - message.length} more characters required`
                : 'Minimum 10 characters'}
            </span>
            <span className="text-xs text-muted">{message.length}/2000</span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to submit feedback. Please try again.
            </p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
