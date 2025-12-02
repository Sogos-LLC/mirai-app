'use client';

import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ContentType } from '@/gen/mirai/v1/sme_pb';

interface SubmitTextModalProps {
  taskId: string;
  taskTitle: string;
  smeName: string;
  onClose: () => void;
  onSubmit: (data: SubmitTextData) => Promise<void>;
}

export interface SubmitTextData {
  taskId: string;
  textContent: string;
  contentType: ContentType;
}

export function SubmitTextModal({
  taskId,
  taskTitle,
  smeName,
  onClose,
  onSubmit,
}: SubmitTextModalProps) {
  const [textContent, setTextContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!textContent.trim()) {
      setError('Please enter some text content');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit({
        taskId,
        textContent: textContent.trim(),
        contentType: ContentType.TEXT,
      });
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to submit text content');
      }
      setLoading(false);
    }
  };

  const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
  const charCount = textContent.length;

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} title="Submit Text Knowledge">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 space-y-4">
          {/* Task Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-600">
              Submitting to: <span className="font-medium text-gray-900">{smeName}</span>
            </p>
            <p className="text-sm text-gray-600">
              Task: <span className="font-medium text-gray-900">{taskTitle}</span>
            </p>
          </div>

          {/* Text Content */}
          <div>
            <label htmlFor="textContent" className="block text-sm font-medium text-gray-700 mb-1">
              Knowledge Content
            </label>
            <textarea
              id="textContent"
              rows={12}
              required
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-base border-gray-300 rounded-md px-3 py-3 border font-mono text-sm"
              placeholder="Paste or type your knowledge content here...

This can include:
- Documentation excerpts
- Process descriptions
- Technical specifications
- Best practices
- FAQs and answers
- Any text-based knowledge"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>{wordCount} words</span>
              <span>{charCount.toLocaleString()} characters</span>
            </div>
          </div>

          {/* Help Text */}
          <div className="text-sm text-gray-500 bg-blue-50 p-3 rounded-lg">
            <p className="font-medium text-blue-700 mb-1">Tips for good knowledge content:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-600">
              <li>Include clear, factual information</li>
              <li>Structure content with headings if long</li>
              <li>Avoid duplicate or redundant information</li>
              <li>Include relevant examples where helpful</li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !textContent.trim()}
            className="w-full sm:w-auto px-4 py-3 lg:py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {loading ? 'Submitting...' : 'Submit Knowledge'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
