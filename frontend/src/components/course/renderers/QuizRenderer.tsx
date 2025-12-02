'use client';

import { useState } from 'react';

interface QuizOption {
  id: string;
  text: string;
}

interface QuizContent {
  question: string;
  questionType: string;
  options: QuizOption[];
  correctAnswerId: string;
  explanation: string;
}

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
      const isCorrect = selectedOption === content.correctAnswerId;
      onAnswer?.(selectedOption, isCorrect);
    }
  };

  const handleReset = () => {
    setSelectedOption(null);
    setShowFeedback(false);
  };

  const isCorrect = selectedOption === content.correctAnswerId;

  if (isEditing && onEdit) {
    return (
      <div className="border rounded-lg p-4 bg-white space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Question</label>
          <textarea
            value={content.question}
            onChange={(e) => onEdit({ ...content, question: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            rows={2}
            placeholder="Enter your question..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Question Type</label>
          <select
            value={content.questionType}
            onChange={(e) => onEdit({ ...content, questionType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="multiple_choice">Multiple Choice</option>
            <option value="true_false">True/False</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Answer Options</label>
          <div className="space-y-2">
            {content.options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correctAnswer"
                  checked={content.correctAnswerId === option.id}
                  onChange={() => onEdit({ ...content, correctAnswerId: option.id })}
                  className="h-4 w-4 text-green-600"
                  title="Mark as correct answer"
                />
                <input
                  type="text"
                  value={option.text}
                  onChange={(e) => {
                    const newOptions = [...content.options];
                    newOptions[index] = { ...option, text: e.target.value };
                    onEdit({ ...content, options: newOptions });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={`Option ${index + 1}`}
                />
                {content.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const newOptions = content.options.filter((_, i) => i !== index);
                      onEdit({
                        ...content,
                        options: newOptions,
                        correctAnswerId:
                          content.correctAnswerId === option.id
                            ? newOptions[0]?.id || ''
                            : content.correctAnswerId,
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
                  options: [...content.options, { id: newId, text: '' }],
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
            value={content.explanation}
            onChange={(e) => onEdit({ ...content, explanation: e.target.value })}
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
        <p className="text-gray-900 font-medium mb-4">{content.question}</p>

        {/* Options */}
        <div className="space-y-2">
          {content.options.map((option) => {
            const isSelected = selectedOption === option.id;
            const isCorrectOption = option.id === content.correctAnswerId;

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
                <span className="ml-3 text-gray-700">{option.text}</span>
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
            <p className="mt-2 text-sm text-gray-700">{content.explanation}</p>
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
