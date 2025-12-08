'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';

interface WizardNavigationProps {
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  onCancel?: () => void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  isLoading?: boolean;
  nextLabel?: string;
  showSkip?: boolean;
  skipLabel?: string;
}

export default function WizardNavigation({
  onBack,
  onNext,
  onSkip,
  onCancel,
  canGoBack = true,
  canGoNext = true,
  isLoading = false,
  nextLabel = 'Next',
  showSkip = false,
  skipLabel = 'Skip',
}: WizardNavigationProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between gap-4 pt-6 mt-6 border-t">
      {/* Left side - Cancel or Back */}
      <div className="flex gap-2">
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
        {canGoBack && onBack && (
          <Button
            variant="secondary"
            onClick={onBack}
            disabled={isLoading}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}
      </div>

      {/* Right side - Skip and Next */}
      <div className="flex gap-2 sm:ml-auto">
        {showSkip && onSkip && (
          <Button
            variant="ghost"
            onClick={onSkip}
            disabled={isLoading}
          >
            {skipLabel}
          </Button>
        )}
        {onNext && (
          <Button
            variant="primary"
            onClick={onNext}
            disabled={!canGoNext || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {nextLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
