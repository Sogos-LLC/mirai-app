'use client';

import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface GeneratingStepProps {
  title?: string;
  description?: string;
  onCancel?: () => void;
}

export default function GeneratingStep({
  title = 'Generating...',
  description = 'Please wait while we process your request.',
  onCancel,
}: GeneratingStepProps) {
  return (
    <Card>
      <CardContent className="py-16">
        <div className="max-w-md mx-auto text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-primary-100 rounded-full animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-primary-600" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mb-4">
            <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
            <h2 className="text-lg sm:text-xl font-bold text-primary">{title}</h2>
          </div>

          <p className="text-sm sm:text-base text-secondary mb-8">{description}</p>

          <div className="flex justify-center gap-2 mb-6">
            <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>

          {onCancel && (
            <Button
              variant="ghost"
              onClick={onCancel}
              className="text-muted"
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
