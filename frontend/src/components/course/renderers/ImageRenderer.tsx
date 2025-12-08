'use client';

import { useState } from 'react';
import type { ImageContent } from '@/gen/mirai/v1/ai_generation_zod';
import { useGenerateComponentImage } from '@/hooks/useAIGeneration';

interface ImageRendererProps {
  content: ImageContent;
  isEditing?: boolean;
  onEdit?: (content: ImageContent) => void;
  // Context needed for AI image generation
  courseId?: string;
  lessonId?: string;
  componentId?: string;
}

export function ImageRenderer({
  content,
  isEditing = false,
  onEdit,
  courseId,
  lessonId,
  componentId,
}: ImageRendererProps) {
  const [imageError, setImageError] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(content.imageDescription || '');
  const { mutate: generateImage, isLoading: isGenerating, error: generateError, reset: resetError } = useGenerateComponentImage();

  // Check if we have a real URL (user-provided or AI-generated, not placeholder)
  const hasRealUrl = content.url && !content.url.includes('example.com');

  // Check if we can generate images (have all required IDs)
  const canGenerate = courseId && lessonId && componentId;

  const handleGenerateImage = async () => {
    if (!canGenerate || !editingPrompt.trim()) return;

    resetError();
    try {
      const result = await generateImage({
        courseId,
        lessonId,
        componentId,
        prompt: editingPrompt.trim(),
        aspectRatio: '16:9',
      });

      // Update the content with the new URL
      if (onEdit && result.imageUrl) {
        setImageError(false);
        onEdit({
          ...content,
          url: result.imageUrl,
          imageDescription: editingPrompt.trim(),
        });
      }
    } catch {
      // Error is handled by the hook
    }
  };

  if (isEditing && onEdit) {
    return (
      <div className="border rounded-lg p-4 bg-surface space-y-3">
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">
            Image Description {canGenerate && '(click Generate to create with AI)'}
          </label>
          <div className="flex gap-2">
            <textarea
              value={editingPrompt}
              onChange={(e) => {
                setEditingPrompt(e.target.value);
                onEdit({
                  ...content,
                  imageDescription: e.target.value,
                });
              }}
              className="flex-1 px-3 py-2 border border-default rounded bg-surface text-primary focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
              rows={2}
              placeholder="Describe what image should be shown..."
              disabled={isGenerating}
            />
            {canGenerate && (
              <button
                onClick={handleGenerateImage}
                disabled={isGenerating || !editingPrompt.trim()}
                className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 min-h-[44px]"
                title="Generate image with AI"
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm">Generating...</span>
                  </>
                ) : (
                  <>
                    {/* Magic wand icon */}
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                    <span className="text-sm">Generate</span>
                  </>
                )}
              </button>
            )}
          </div>
          {generateError && (
            <p className="mt-1 text-xs text-red-500">
              Failed to generate image. Please try again.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Image URL (optional - add your own image)</label>
          <input
            type="url"
            value={content.url || ''}
            onChange={(e) => {
              setImageError(false);
              onEdit({
                ...content,
                url: e.target.value || undefined,
              });
            }}
            className="w-full px-3 py-2 border border-default rounded bg-surface text-primary focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg"
            disabled={isGenerating}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Alt Text (for accessibility)</label>
          <input
            type="text"
            value={content.altText}
            onChange={(e) =>
              onEdit({
                ...content,
                altText: e.target.value,
              })
            }
            className="w-full px-3 py-2 border border-default rounded bg-surface text-primary focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Describe the image for screen readers..."
            disabled={isGenerating}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Caption (optional)</label>
          <input
            type="text"
            value={content.caption || ''}
            onChange={(e) =>
              onEdit({
                ...content,
                caption: e.target.value || undefined,
              })
            }
            className="w-full px-3 py-2 border border-default rounded bg-surface text-primary focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Add a caption..."
            disabled={isGenerating}
          />
        </div>
        {hasRealUrl && (
          <div className="pt-2 border-t border-subtle">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-secondary">Preview:</p>
              {canGenerate && (
                <button
                  onClick={handleGenerateImage}
                  disabled={isGenerating || !editingPrompt.trim()}
                  className="text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Regenerate
                </button>
              )}
            </div>
            <div className="relative max-w-md">
              {isGenerating ? (
                <div className="aspect-video bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <svg className="animate-spin h-8 w-8 text-purple-600 mx-auto mb-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-sm text-purple-600">Generating image...</p>
                  </div>
                </div>
              ) : !imageError ? (
                <img
                  src={content.url}
                  alt={content.altText || 'Preview'}
                  onError={() => setImageError(true)}
                  className="max-w-full h-auto rounded-lg shadow"
                />
              ) : (
                <div className="p-4 bg-hover rounded-lg text-center text-sm text-secondary">
                  Failed to load image preview
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Show placeholder when no real URL or image load error
  if (!hasRealUrl || imageError) {
    return (
      <figure className="my-4">
        <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg border-2 border-dashed border-indigo-200 dark:border-indigo-800">
          <div className="flex items-start gap-4">
            {/* Image icon */}
            <div className="flex-shrink-0 p-3 bg-surface rounded-lg shadow-sm">
              <svg className="h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            {/* Description */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-1">
                Image Placeholder
              </p>
              <p className="text-sm text-primary leading-relaxed">
                {content.imageDescription || content.altText || 'An image will be added here'}
              </p>
              {content.caption && (
                <p className="mt-2 text-xs text-secondary italic">{content.caption}</p>
              )}
            </div>
          </div>
        </div>
      </figure>
    );
  }

  return (
    <figure className="my-4">
      <div className="relative overflow-hidden rounded-lg shadow-md">
        <img
          src={content.url}
          alt={content.altText}
          onError={() => setImageError(true)}
          className="max-w-full h-auto mx-auto"
        />
      </div>
      {content.caption && (
        <figcaption className="mt-2 text-center text-sm text-secondary italic">{content.caption}</figcaption>
      )}
    </figure>
  );
}
