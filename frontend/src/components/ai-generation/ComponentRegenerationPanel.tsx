'use client';

import { useState } from 'react';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_types_pb';
import type { LessonComponentType } from '@/gen/mirai/v1/component_enums_pb';
import { getComponentTypeName, getComponentTypeIcon } from '@/components/course/renderers';

interface ComponentRegenerationPanelProps {
  component: LessonComponent;
  onRegenerate: (prompt: string) => void;
  onCancel: () => void;
  isRegenerating?: boolean;
}

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  { label: 'Make it simpler', prompt: 'Simplify this content to be more accessible for beginners.' },
  { label: 'Add more detail', prompt: 'Expand this content with more details and examples.' },
  { label: 'Make it shorter', prompt: 'Condense this content while keeping the key information.' },
  { label: 'More engaging', prompt: 'Make this content more engaging and interactive.' },
  { label: 'Add examples', prompt: 'Include practical examples to illustrate the concepts.' },
  { label: 'Professional tone', prompt: 'Adjust the tone to be more professional and formal.' },
];

export function ComponentRegenerationPanel({
  component,
  onRegenerate,
  onCancel,
  isRegenerating = false,
}: ComponentRegenerationPanelProps) {
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedQuickPrompt, setSelectedQuickPrompt] = useState<string | null>(null);

  const handleRegenerate = () => {
    const prompt = selectedQuickPrompt || customPrompt;
    if (prompt.trim()) {
      onRegenerate(prompt);
    }
  };

  const handleQuickPromptSelect = (prompt: string) => {
    setSelectedQuickPrompt(prompt);
    setCustomPrompt('');
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border-2 border-indigo-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{getComponentTypeIcon(component.type)}</span>
          <div>
            <h3 className="text-white font-medium">Regenerate {getComponentTypeName(component.type)}</h3>
            <p className="text-indigo-100 text-xs">Tell AI how to improve this component</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Quick Prompts */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Quick Options
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                type="button"
                onClick={() => handleQuickPromptSelect(qp.prompt)}
                disabled={isRegenerating}
                className={`
                  px-3 py-1.5 text-sm rounded-full border transition-all
                  ${
                    selectedQuickPrompt === qp.prompt
                      ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-white text-gray-400">or write your own</span>
          </div>
        </div>

        {/* Custom Prompt */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Custom Instructions
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              setSelectedQuickPrompt(null);
            }}
            disabled={isRegenerating}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm disabled:bg-gray-50 disabled:cursor-not-allowed resize-none"
            placeholder="Describe how you'd like this content to change..."
          />
        </div>

        {/* Selected Prompt Preview */}
        {(selectedQuickPrompt || customPrompt) && (
          <div className="bg-indigo-50 rounded-lg p-3">
            <p className="text-xs font-medium text-indigo-700 mb-1">AI will:</p>
            <p className="text-sm text-indigo-900">{selectedQuickPrompt || customPrompt}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-gray-50 border-t flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isRegenerating}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isRegenerating || (!selectedQuickPrompt && !customPrompt.trim())}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isRegenerating ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Regenerating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Floating AI Assist Button
interface AIAssistButtonProps {
  onClick: () => void;
  isActive?: boolean;
}

export function AIAssistButton({ onClick, isActive = false }: AIAssistButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
        ${
          isActive
            ? 'bg-indigo-600 text-white shadow-lg'
            : 'bg-white text-gray-700 border border-gray-300 hover:border-indigo-300 hover:bg-indigo-50'
        }
      `}
    >
      <svg
        className={`w-4 h-4 ${isActive ? 'text-white' : 'text-indigo-500 group-hover:text-indigo-600'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
      AI Assist
    </button>
  );
}
