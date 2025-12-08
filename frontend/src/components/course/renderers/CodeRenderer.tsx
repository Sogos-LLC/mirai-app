'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeContent {
  code: string;
  language: string;
}

interface CodeRendererProps {
  content: CodeContent;
  isEditing?: boolean;
  onEdit?: (content: CodeContent) => void;
}

// Simple language-specific styling
const languageLabels: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  shell: 'Shell',
  bash: 'Bash',
  powershell: 'PowerShell',
};

export function CodeRenderer({ content, isEditing = false, onEdit }: CodeRendererProps) {
  const [copied, setCopied] = useState(false);
  const [editContent, setEditContent] = useState(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const languageLabel = languageLabels[content.language?.toLowerCase()] || content.language || 'Code';

  if (isEditing && onEdit) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-b">
          <div className="flex items-center gap-2">
            <select
              value={editContent.language}
              onChange={(e) => {
                const updated = { ...editContent, language: e.target.value };
                setEditContent(updated);
                onEdit(updated);
              }}
              className="text-sm bg-transparent border rounded px-2 py-1 text-primary"
            >
              <option value="">Select language</option>
              {Object.entries(languageLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <textarea
          value={editContent.code}
          onChange={(e) => {
            const updated = { ...editContent, code: e.target.value };
            setEditContent(updated);
            onEdit(updated);
          }}
          className="w-full p-4 font-mono text-sm bg-gray-900 text-gray-100 resize-none min-h-[200px] focus:outline-none"
          placeholder="Enter your code here..."
        />
      </div>
    );
  }

  return (
    <div className="relative group rounded-lg overflow-hidden border bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-400">{languageLabel}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          aria-label={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code block */}
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm font-mono text-gray-100 whitespace-pre">
          {content.code}
        </code>
      </pre>
    </div>
  );
}
