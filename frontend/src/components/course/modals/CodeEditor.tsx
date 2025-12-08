'use client';

import { useState } from 'react';

interface CodeContent {
  code: string;
  language: string;
}

interface CodeEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'html',
  'css',
  'json',
  'sql',
  'bash',
  'markdown',
  'yaml',
  'xml',
];

export function CodeEditor({ contentJson, onSave }: CodeEditorProps) {
  const parsed = JSON.parse(contentJson) as CodeContent;
  const [code, setCode] = useState(parsed.code || '');
  const [language, setLanguage] = useState(parsed.language || 'javascript');

  const handleSave = () => {
    onSave(JSON.stringify({ code, language }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Language
        </label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang.charAt(0).toUpperCase() + lang.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Code
        </label>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={12}
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            font-mono text-sm text-green-400 resize-none"
          placeholder="Enter your code here..."
          spellCheck={false}
        />
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 text-xs text-gray-400 font-mono">
            {language}
          </div>
          <pre className="p-4 text-sm text-gray-100 overflow-x-auto font-mono">
            <code>{code || '// Your code will appear here'}</code>
          </pre>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
