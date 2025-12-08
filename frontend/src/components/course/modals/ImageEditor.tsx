'use client';

import { useState } from 'react';
import { Image as ImageIcon, Sparkles, RefreshCw } from 'lucide-react';
import { useGenerateComponentImage } from '@/hooks/useAIGeneration';
import Button from '@/components/ui/Button';

interface ImageContent {
  imageDescription: string;
  altText: string;
  caption?: string;
  url?: string;
}

interface ImageEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
  // Context for AI generation
  courseId?: string;
  generatedLessonId?: string;
  componentId?: string;
}

export function ImageEditor({
  contentJson,
  onSave,
  courseId,
  generatedLessonId,
  componentId,
}: ImageEditorProps) {
  const parsed = JSON.parse(contentJson) as ImageContent;
  const [url, setUrl] = useState(parsed.url || '');
  const [altText, setAltText] = useState(parsed.altText || '');
  const [caption, setCaption] = useState(parsed.caption || '');
  const [imageDescription, setImageDescription] = useState(parsed.imageDescription || '');
  const [imageError, setImageError] = useState(false);

  const {
    mutate: generateImage,
    isLoading: isGenerating,
    error: generateError,
    reset: resetError,
  } = useGenerateComponentImage();

  // Check if we can generate images (have all required context)
  const canGenerate = courseId && generatedLessonId && componentId;

  // Check if we have a real URL (not placeholder)
  const hasRealUrl = url && !url.includes('example.com');

  const handleGenerateImage = async () => {
    if (!canGenerate || !imageDescription.trim()) return;

    resetError();
    try {
      const result = await generateImage({
        courseId,
        generatedLessonId,
        componentId,
        prompt: imageDescription.trim(),
        aspectRatio: '16:9',
      });

      // Update the URL with the generated image
      if (result.imageUrl) {
        setUrl(result.imageUrl);
        setImageError(false);

        // Auto-save to persist the URL immediately to localComponents
        // This prevents the URL from being lost if the user closes the modal
        // without clicking "Save Changes"
        onSave(
          JSON.stringify({
            imageDescription: imageDescription.trim(),
            altText,
            caption: caption || undefined,
            url: result.imageUrl,
          })
        );
      }
    } catch {
      // Error is handled by the hook
    }
  };

  const handleSave = () => {
    onSave(
      JSON.stringify({
        imageDescription,
        altText,
        caption: caption || undefined,
        url: url || undefined,
      })
    );
  };

  return (
    <div className="space-y-6">
      {/* AI Image Generation Section */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
              AI Image Generation
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
              Describe the image you want and let AI generate it
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <textarea
            value={imageDescription}
            onChange={(e) => setImageDescription(e.target.value)}
            className="w-full px-4 py-3 text-base bg-surface border border-default rounded-lg
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              text-primary placeholder:text-muted resize-y min-h-[80px]"
            placeholder="Describe what image should be shown (e.g., 'A professional diagram showing the data flow between microservices')"
            disabled={isGenerating}
          />

          {canGenerate && (
            <Button
              onClick={handleGenerateImage}
              disabled={isGenerating || !imageDescription.trim()}
              variant="primary"
              className="w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Image</span>
                </>
              )}
            </Button>
          )}

          {!canGenerate && (
            <p className="text-xs text-muted">
              Save the course first to enable AI image generation
            </p>
          )}

          {generateError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to generate image. Please try again.
            </p>
          )}
        </div>
      </div>

      {/* Manual URL Input */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Image URL (or paste your own)
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setImageError(false);
          }}
          className="w-full px-4 py-3 text-base bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="https://example.com/image.jpg"
          disabled={isGenerating}
        />
      </div>

      {/* Alt Text */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Alt Text (for accessibility)
        </label>
        <input
          type="text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          className="w-full px-4 py-3 text-base bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Describe the image for screen readers..."
          disabled={isGenerating}
        />
      </div>

      {/* Caption */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Caption (optional)
        </label>
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full px-4 py-3 text-base bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Figure 1: Description..."
          disabled={isGenerating}
        />
      </div>

      {/* Preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-primary">Preview</label>
          {hasRealUrl && canGenerate && (
            <button
              onClick={handleGenerateImage}
              disabled={isGenerating || !imageDescription.trim()}
              className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
          )}
        </div>
        <div className="p-4 bg-hover rounded-lg">
          {isGenerating ? (
            <div className="aspect-video bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 text-purple-600 dark:text-purple-400 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-purple-600 dark:text-purple-400">Generating image...</p>
              </div>
            </div>
          ) : hasRealUrl && !imageError ? (
            <figure>
              <img
                src={url}
                alt={altText || 'Preview'}
                className="max-w-full h-auto rounded-lg mx-auto"
                onError={() => setImageError(true)}
              />
              {caption && (
                <figcaption className="text-sm text-muted text-center mt-2">
                  {caption}
                </figcaption>
              )}
            </figure>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted">
              <ImageIcon className="w-12 h-12 mb-2" />
              <p className="text-sm">
                {imageError ? 'Failed to load image' : 'No image URL provided'}
              </p>
              {imageDescription && !hasRealUrl && (
                <p className="text-xs mt-1 text-center max-w-xs">
                  Click &quot;Generate Image&quot; to create an image from your description
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <Button onClick={handleSave} variant="primary" disabled={isGenerating}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
