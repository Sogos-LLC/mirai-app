'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

interface AIGenerateButtonProps {
  onClick: () => void;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  disabled?: boolean;
  isGenerating?: boolean;
}

export default function AIGenerateButton({
  onClick,
  label = 'AI Generate',
  size = 'medium',
  className = '',
  disabled = false,
  isGenerating = false,
}: AIGenerateButtonProps) {
  const sizeClasses = {
    small: 'px-2 py-1 text-xs',
    medium: 'px-3 py-1.5 text-sm',
    large: 'px-4 py-2 text-base',
  };

  const iconSizes = {
    small: 14,
    medium: 16,
    large: 20,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isGenerating}
      className={`
        inline-flex items-center gap-1.5
        bg-gradient-to-r from-purple-500 to-purple-600
        hover:from-purple-600 hover:to-purple-700
        text-white font-medium rounded-lg
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${isGenerating ? 'animate-pulse' : ''}
        ${className}
      `}
    >
      <Sparkles
        size={iconSizes[size]}
        className={isGenerating ? 'animate-spin' : ''}
      />
      <span>{isGenerating ? 'Generating...' : label}</span>
    </button>
  );
}