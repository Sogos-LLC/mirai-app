'use client';

import { useState } from 'react';
import type { QuizContent, QuizOption } from '@/gen/mirai/v1/component_content_zod';

interface QuizRendererProps {
  content: QuizContent;
  isEditing?: boolean;
  onEdit?: (content: QuizContent) => void;
  onAnswer?: (optionId: string, isCorrect: boolean) => void;
}

export function QuizRenderer({ content, isEditing = false, onEdit, onAnswer }: QuizRendererProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleSubmit = () => {
    if (selectedOption) {
      setShowFeedback(true);
      const isCorrect = selectedOption === content.quizCorrectAnswerId;
      onAnswer?.(selectedOption, isCorrect);
    }
  };

  const handleReset = () => {
    setSelectedOption(null);
    setShowFeedback(false);
  };

  const isCorrect = selectedOption === content.quizCorrectAnswerId;

  if (isEditing && onEdit) {
    return (
      <div className="border rounded-lg p-4 bg-white space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Question</label>
          <textarea
            value={content.quizQuestion}
            onChange={(e) => onEdit({ ...content, quizQuestion: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            rows={2}
            placeholder="Enter your question..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Answer Options</label>
          <div className="space-y-2">
            {content.quizOptions.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correctAnswer"
                  checked={content.quizCorrectAnswerId === option.id}
                  onChange={() => onEdit({ ...content, quizCorrectAnswerId: option.id })}
                  className="h-4 w-4 text-green-600"
                  title="Mark as correct answer"
                />
                <input
                  type="text"
                  value={option.text}
                  onChange={(e) => {
                    const newOptions = [...content.quizOptions];
                    newOptions[index] = { ...option, text: e.target.value };
                    onEdit({ ...content, quizOptions: newOptions });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={`Option ${index + 1}`}
                />
                {content.quizOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const newOptions = content.quizOptions.filter((_, i) => i !== index);
                      onEdit({
                        ...content,
                        quizOptions: newOptions,
                        quizCorrectAnswerId:
                          content.quizCorrectAnswerId === option.id
                            ? newOptions[0]?.id || ''
                            : content.quizCorrectAnswerId,
                      });
                    }}
                    className="p-1 text-red-500 hover:text-red-700"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const newId = `option_${Date.now()}`;
                onEdit({
                  ...content,
                  quizOptions: [...content.quizOptions, { id: newId, text: '' }],
                });
              }}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Option
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">Select the radio button next to the correct answer</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Explanation</label>
          <textarea
            value={content.quizExplanation}
            onChange={(e) => onEdit({ ...content, quizExplanation: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            rows={2}
            placeholder="Explain why the answer is correct..."
          />
        </div>

      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">📝</span>
          <h4 className="font-medium text-indigo-900">Knowledge Check</h4>
        </div>
      </div>

      {/* Question */}
      <div className="p-4">
        <p className="text-gray-900 font-medium mb-4" dangerouslySetInnerHTML={{ __html: content.quizQuestion }} />

        {/* Options */}
        <div className="space-y-2">
          {content.quizOptions.map((option) => {
            const isSelected = selectedOption === option.id;
            const isCorrectOption = option.id === content.quizCorrectAnswerId;

            let optionStyle = 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50';
            if (showFeedback) {
              if (isCorrectOption) {
                optionStyle = 'border-green-500 bg-green-50';
              } else if (isSelected && !isCorrect) {
                optionStyle = 'border-red-500 bg-red-50';
              }
            } else if (isSelected) {
              optionStyle = 'border-indigo-500 bg-indigo-50';
            }

            return (
              <label
                key={option.id}
                className={`
                  flex items-center p-3 border rounded-lg cursor-pointer transition-all
                  ${showFeedback ? 'cursor-default' : 'cursor-pointer'}
                  ${optionStyle}
                `}
              >
                <input
                  type="radio"
                  name="quiz-option"
                  value={option.id}
                  checked={isSelected}
                  onChange={() => !showFeedback && setSelectedOption(option.id)}
                  disabled={showFeedback}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-3 text-gray-700" dangerouslySetInnerHTML={{ __html: option.text }} />
                {showFeedback && isCorrectOption && (
                  <svg className="ml-auto h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {showFeedback && isSelected && !isCorrect && (
                  <svg className="ml-auto h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </label>
            );
          })}
        </div>

        {/* Feedback */}
        {showFeedback && (
          <div className={`mt-4 p-4 rounded-lg ${isCorrect ? 'bg-green-50' : 'bg-amber-50'}`}>
            <p className={`font-medium ${isCorrect ? 'text-green-800' : 'text-amber-800'}`}>
              {isCorrect ? 'Correct!' : 'Not quite right.'}
            </p>
            <p className="mt-2 text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: content.quizExplanation }} />
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          {showFeedback ? (
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Try Again
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!selectedOption}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Check Answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
