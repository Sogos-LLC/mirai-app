'use client';

import React from 'react';
import { Monitor, Moon, Sun, Check } from 'lucide-react';
import { useTheme } from '@/contexts';

type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeCardProps {
  id: ThemeOption;
  label: string;
  icon: React.ElementType;
  isSelected: boolean;
  onClick: () => void;
}

function ThemeCard({ id, label, icon: Icon, isSelected, onClick }: ThemeCardProps) {
  return (
    <button
      onClick={onClick}
      className={`relative border-2 rounded-xl p-4 transition-all duration-200 hover:border-primary-400 ${
        isSelected
          ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface'
      }`}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Theme preview */}
      <div
        className={`h-20 rounded-lg mb-3 flex items-center justify-center ${
          id === 'dark'
            ? 'bg-gradient-to-br from-[#1a1625] to-[#0f0d15]'
            : id === 'light'
            ? 'bg-gradient-to-br from-gray-50 to-white border border-gray-200'
            : 'bg-gradient-to-r from-white via-gray-200 to-[#1a1625]'
        }`}
      >
        <Icon
          className={`w-8 h-8 ${
            id === 'dark'
              ? 'text-primary-400'
              : id === 'light'
              ? 'text-primary-600'
              : 'text-gray-500'
          }`}
        />
      </div>

      {/* Label */}
      <p className="font-medium text-center text-gray-900 dark:text-gray-100">
        {label}
      </p>
      <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-1">
        {id === 'light' && 'Classic light appearance'}
        {id === 'dark' && 'Easy on the eyes'}
        {id === 'system' && 'Match your device'}
      </p>
    </button>
  );
}

export default function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const themes: { id: ThemeOption; label: string; icon: React.ElementType }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div>
      <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Appearance
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Customize how Mirai looks on your device
      </p>

      {/* Theme Selection */}
      <div className="mb-8">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Theme</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {themes.map((t) => (
            <ThemeCard
              key={t.id}
              id={t.id}
              label={t.label}
              icon={t.icon}
              isSelected={theme === t.id}
              onClick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </div>

      {/* Current theme indicator */}
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-dark-surface-elevated border border-gray-200 dark:border-dark-border">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Currently using:{' '}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {resolvedTheme === 'dark' ? 'Dark' : 'Light'} theme
          </span>
          {theme === 'system' && (
            <span className="text-gray-500 dark:text-gray-500"> (following system preference)</span>
          )}
        </p>
      </div>
    </div>
  );
}
