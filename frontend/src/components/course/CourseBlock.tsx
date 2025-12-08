'use client';

import React, { useState, useEffect } from 'react';
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
import type { CourseBlock as CourseBlockType } from '@/gen/mirai/v1/course_pb';
import { BlockType } from '@/gen/mirai/v1/course_pb';
import {
  useRegenerateComponent,
  useGetJob,
  useGetGeneratedLesson,
  GenerationJobStatus,
} from '@/hooks/useAIGeneration';

interface CourseBlockProps {
  block: CourseBlockType;
  courseId?: string;
  generatedLessonId?: string;
  onUpdate: (block: CourseBlockType) => void;
  onDelete: (blockId: string) => void;
  onAlignmentClick: (blockId: string) => void;
  isActive: boolean;
}

export default function CourseBlock({
  block,
  courseId,
  generatedLessonId,
  onUpdate,
  onDelete,
  onAlignmentClick,
  isActive
}: CourseBlockProps) {
  const [promptValue, setPromptValue] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);

  // Regeneration hooks
  const regenerateHook = useRegenerateComponent();
  const { data: currentJob } = useGetJob(currentJobId || undefined);
  const { data: lesson, refetch: refetchLesson } = useGetGeneratedLesson(generatedLessonId);

  // Watch for job completion
  useEffect(() => {
    if (!currentJob || !currentJobId) return;

    if (currentJob.status === GenerationJobStatus.COMPLETED) {
      // Job completed - fetch updated lesson to get new component
      refetchLesson().then(() => {
        const updatedComponent = lesson?.components.find((c) => c.id === block.id);
        if (updatedComponent) {
          // Update block with regenerated content
          const newBlock: CourseBlockType = {
            ...block,
            content: updatedComponent.contentJson,
          };
          onUpdate(newBlock);
        }
        setIsRegenerating(false);
        setCurrentJobId(null);
        setPromptValue('');
      });
    } else if (currentJob.status === GenerationJobStatus.FAILED) {
      setRegenerationError(currentJob.errorMessage || 'Regeneration failed');
      setIsRegenerating(false);
      setCurrentJobId(null);
    }
  }, [currentJob, currentJobId, lesson, block, onUpdate, refetchLesson]);

  const getBlockIcon = () => {
    switch (block.type) {
      case BlockType.HEADING:
        return <Type size={16} />;
      case BlockType.TEXT:
        return <FileText size={16} />;
      case BlockType.INTERACTIVE:
        return <MousePointer size={16} />;
      case BlockType.KNOWLEDGE_CHECK:
        return <CheckCircle size={16} />;
      default:
        return null;
    }
  };

  const getBlockTypeLabel = () => {
    switch (block.type) {
      case BlockType.HEADING:
        return 'Heading Block';
      case BlockType.TEXT:
        return 'Text Block';
      case BlockType.INTERACTIVE:
        return 'Interactive Block';
      case BlockType.KNOWLEDGE_CHECK:
        return 'Knowledge Check';
      default:
        return 'Block';
    }
  };

  const handlePromptSubmit = async () => {
    if (!promptValue.trim()) return;

    // If no courseId/generatedLessonId, fall back to mock behavior
    if (!courseId || !generatedLessonId) {
      setIsRegenerating(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      onUpdate({
        ...block,
        content: block.content + '\n\n[AI Updated: ' + promptValue + ']',
        prompt: promptValue
      });
      setPromptValue('');
      setIsRegenerating(false);
      return;
    }

    setIsRegenerating(true);
    setRegenerationError(null);

    try {
      const result = await regenerateHook.mutate({
        courseId,
        generatedLessonId,
        componentId: block.id,
        modificationPrompt: promptValue,
      });

      if (result.job) {
        // Set job ID to start polling
        setCurrentJobId(result.job.id);
      } else {
        throw new Error('No job returned from regeneration');
      }
    } catch (error) {
      console.error('Regeneration failed:', error);
      setRegenerationError(error instanceof Error ? error.message : 'Regeneration failed');
      setIsRegenerating(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-dark-surface border rounded-lg transition-all ${
      isActive ? 'border-purple-400 dark:border-purple-500 shadow-lg dark:shadow-glow-sm' : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-border-input'
    }`}>
      {/* Block Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-dark-border">
        <div className="flex items-center gap-3">
          <button className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-move">
            <GripVertical size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-100 dark:bg-dark-50 rounded flex items-center justify-center text-gray-600 dark:text-gray-400">
              {getBlockIcon()}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {getBlockTypeLabel()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onAlignmentClick(block.id)}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-50 rounded"
            title="Alignment settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => onDelete(block.id)}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            title="Delete block"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Block Content */}
      <div className="p-4">
        {block.type === BlockType.HEADING ? (
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{block.content}</h3>
        ) : block.type === BlockType.INTERACTIVE ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
              <MousePointer size={16} />
              <span className="font-medium">Interactive Element</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300">{block.content}</p>
          </div>
        ) : block.type === BlockType.KNOWLEDGE_CHECK ? (
          (() => {
            try {
              const quizData = JSON.parse(block.content);
              return (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/40 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-3">
                    <CheckCircle size={16} />
                    <span className="font-medium">Knowledge Check</span>
                  </div>
                  <p className="text-gray-800 dark:text-white font-medium mb-3">{quizData.question}</p>
                  <div className="space-y-1 text-sm">
                    {quizData.options.map((option: string, index: number) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${
                          index === quizData.correctAnswer
                            ? 'border-green-500 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                            : 'border-gray-300 dark:border-dark-border'
                        }`}>
                          {index === quizData.correctAnswer && '✓'}
                        </span>
                        <span className={index === quizData.correctAnswer ? 'text-green-700 dark:text-green-400 font-medium' : 'text-gray-600 dark:text-gray-400'}>
                          {option}
                        </span>
                      </div>
                    ))}
                  </div>
                  {quizData.explanation && (
                    <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800/40">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Explanation:</span> {quizData.explanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            } catch {
              // Fallback for old format
              return (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                    <CheckCircle size={16} />
                    <span className="font-medium">Knowledge Check</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300">{block.content}</p>
                </div>
              );
            }
          })()

        ) : (
          <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{block.content}</div>
        )}
      </div>

      {/* AI Prompt Bar */}
      <div className="border-t border-gray-100 dark:border-dark-border p-3 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
        {regenerationError && (
          <div className="mb-2 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg flex items-center justify-between">
            <span>{regenerationError}</span>
            <button
              onClick={() => setRegenerationError(null)}
              className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
          <input
            type="text"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handlePromptSubmit()}
            placeholder="How would you like this block altered?"
            className="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:outline-none transition-colors
              bg-white dark:bg-dark-400
              border-purple-200 dark:border-purple-800/50
              text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              focus:border-purple-400 dark:focus:border-purple-500"
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
