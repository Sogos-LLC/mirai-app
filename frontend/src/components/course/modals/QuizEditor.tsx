'use client';

import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import type { QuizContent, QuizOption } from '@/gen/mirai/v1/component_content_zod';

interface QuizEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

export function QuizEditor({ contentJson, onSave }: QuizEditorProps) {
  const parsed = JSON.parse(contentJson) as QuizContent;
  const [question, setQuestion] = useState(parsed.quizQuestion || '');
  const [options, setOptions] = useState<QuizOption[]>(
    parsed.quizOptions?.length ? parsed.quizOptions : [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
    ]
  );
  const [correctAnswerId, setCorrectAnswerId] = useState(parsed.quizCorrectAnswerId || 'a');
  const [explanation, setExplanation] = useState(parsed.quizExplanation || '');

  const handleAddOption = () => {
    const nextId = String.fromCharCode(97 + options.length); // a, b, c, d...
    setOptions([...options, { id: nextId, text: '' }]);
  };

  const handleRemoveOption = (id: string) => {
    if (options.length <= 2) return; // Minimum 2 options
    const newOptions = options.filter((o) => o.id !== id);
    setOptions(newOptions);
    if (correctAnswerId === id) {
      setCorrectAnswerId(newOptions[0].id);
    }
  };

  const handleOptionChange = (id: string, text: string) => {
    setOptions(options.map((o) => (o.id === id ? { ...o, text } : o)));
  };

  const handleSave = () => {
    onSave(JSON.stringify({
      quizQuestion: question,
      quizOptions: options,
      quizCorrectAnswerId: correctAnswerId,
      quizExplanation: explanation,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Question
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="Enter your question..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Answer Options
        </label>
        <div className="space-y-2">
          {options.map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <button
                onClick={() => setCorrectAnswerId(option.id)}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  correctAnswerId === option.id
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-default hover:border-green-400'
                }`}
                title="Mark as correct answer"
              >
                {correctAnswerId === option.id && <Check className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={option.text}
                onChange={(e) => handleOptionChange(option.id, e.target.value)}
                className="flex-1 px-4 py-2 bg-surface border border-default rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                  text-primary placeholder:text-muted"
                placeholder={`Option ${option.id.toUpperCase()}`}
              />
              {options.length > 2 && (
                <button
                  onClick={() => handleRemoveOption(option.id)}
                  className="p-2 text-muted hover:text-red-500 transition-colors"
                  title="Remove option"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <button
            onClick={handleAddOption}
            className="mt-2 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
          >
            <Plus className="w-4 h-4" />
            Add Option
          </button>
        )}
        <p className="mt-2 text-xs text-muted">
          Click the circle to mark the correct answer (green = correct)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Explanation (shown after answering)
        </label>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="Explain why the correct answer is right..."
        />
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="font-medium text-primary mb-3">{question || 'Your question here?'}</p>
          <div className="space-y-2">
            {options.map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                    option.id === correctAnswerId
                      ? 'border-green-500 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {option.id === correctAnswerId && '✓'}
                </span>
                <span className={option.id === correctAnswerId ? 'text-green-700 dark:text-green-400 font-medium' : 'text-secondary'}>
                  {option.text || `Option ${option.id.toUpperCase()}`}
                </span>
              </div>
            ))}
          </div>
          {explanation && (
            <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
              <p className="text-xs text-secondary">
                <span className="font-medium">Explanation:</span> {explanation}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
