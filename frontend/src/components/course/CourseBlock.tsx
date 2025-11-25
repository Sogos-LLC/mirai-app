'use client';

import React, { useState } from 'react';
import {
  GripVertical,
  Trash2,
  Settings,
  Type,
  FileText,
  MousePointer,
  CheckCircle,
  Sparkles
} from 'lucide-react';
import { CourseBlock as CourseBlockType } from '@/types';

interface CourseBlockProps {
  block: CourseBlockType;
  onUpdate: (block: CourseBlockType) => void;
  onDelete: (blockId: string) => void;
  onAlignmentClick: (blockId: string) => void;
  isActive: boolean;
}

export default function CourseBlock({
  block,
  onUpdate,
  onDelete,
  onAlignmentClick,
  isActive
}: CourseBlockProps) {
  const [promptValue, setPromptValue] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const getBlockIcon = () => {
    switch (block.type) {
      case 'heading':
        return <Type size={16} />;
      case 'text':
        return <FileText size={16} />;
      case 'interactive':
        return <MousePointer size={16} />;
      case 'knowledgeCheck':
        return <CheckCircle size={16} />;
      default:
        return null;
    }
  };

  const getBlockTypeLabel = () => {
    switch (block.type) {
      case 'heading':
        return 'Heading Block';
      case 'text':
        return 'Text Block';
      case 'interactive':
        return 'Interactive Block';
      case 'knowledgeCheck':
        return 'Knowledge Check';
      default:
        return 'Block';
    }
  };

  const handlePromptSubmit = async () => {
    if (!promptValue.trim()) return;

    setIsRegenerating(true);
    // Simulate AI regeneration
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In a real app, this would call an AI service
    onUpdate({
      ...block,
      content: block.content + '\n\n[AI Updated: ' + promptValue + ']',
      prompt: promptValue
    });

    setPromptValue('');
    setIsRegenerating(false);
  };

  return (
    <div className={`bg-white border rounded-lg transition-all ${
      isActive ? 'border-purple-400 shadow-lg' : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Block Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button className="text-gray-400 hover:text-gray-600 cursor-move">
            <GripVertical size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-gray-600">
              {getBlockIcon()}
            </div>
            <span className="text-sm font-medium text-gray-700">
              {getBlockTypeLabel()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onAlignmentClick(block.id)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Alignment settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => onDelete(block.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
            title="Delete block"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Block Content */}
      <div className="p-4">
        {block.type === 'heading' ? (
          <h3 className="text-xl font-semibold text-gray-900">{block.content}</h3>
        ) : block.type === 'interactive' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 mb-2">
              <MousePointer size={16} />
              <span className="font-medium">Interactive Element</span>
            </div>
            <p className="text-gray-700">{block.content}</p>
          </div>
        ) : block.type === 'knowledgeCheck' ? (
          (() => {
            try {
              const quizData = JSON.parse(block.content);
              return (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 mb-3">
                    <CheckCircle size={16} />
                    <span className="font-medium">Knowledge Check</span>
                  </div>
                  <p className="text-gray-800 font-medium mb-3">{quizData.question}</p>
                  <div className="space-y-1 text-sm">
                    {quizData.options.map((option: string, index: number) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${
                          index === quizData.correctAnswer
                            ? 'border-green-500 bg-green-100 text-green-700'
                            : 'border-gray-300'
                        }`}>
                          {index === quizData.correctAnswer && '✓'}
                        </span>
                        <span className={index === quizData.correctAnswer ? 'text-green-700 font-medium' : 'text-gray-600'}>
                          {option}
                        </span>
                      </div>
                    ))}
                  </div>
                  {quizData.explanation && (
                    <div className="mt-3 pt-3 border-t border-green-200">
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">Explanation:</span> {quizData.explanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            } catch (e) {
              // Fallback for old format
              return (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 mb-2">
                    <CheckCircle size={16} />
                    <span className="font-medium">Knowledge Check</span>
                  </div>
                  <p className="text-gray-700">{block.content}</p>
                </div>
              );
            }
          })()

        ) : (
          <div className="text-gray-700 whitespace-pre-wrap">{block.content}</div>
        )}
      </div>

      {/* AI Prompt Bar */}
      <div className="border-t border-gray-100 p-3 bg-gradient-to-r from-purple-50 to-purple-100">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-600" />
          <input
            type="text"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handlePromptSubmit()}
            placeholder="How would you like this block altered?"
            className="flex-1 px-3 py-1.5 text-sm border border-purple-200 rounded-lg focus:outline-none focus:border-purple-400 bg-white"
            disabled={isRegenerating}
          />
          <button
            onClick={handlePromptSubmit}
            disabled={!promptValue.trim() || isRegenerating}
            className="px-4 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRegenerating ? 'Updating...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}