'use client';

import { useState } from 'react';

// New schema: Gemini provides description instead of URL
// URL can be added later by user or image search integration
interface ImageContent {
  imageDescription: string;
  altText: string;
  caption?: string;
  // Optional URL - only present if user adds a real image
  url?: string;
}

interface ImageRendererProps {
  content: ImageContent;
  isEditing?: boolean;
  onEdit?: (content: ImageContent) => void;
}

export function ImageRenderer({ content, isEditing = false, onEdit }: ImageRendererProps) {
  const [imageError, setImageError] = useState(false);

  // Check if we have a real URL (user-provided, not placeholder)
  const hasRealUrl = content.url && !content.url.includes('example.com');

  if (isEditing && onEdit) {
    return (
      <div className="border rounded-lg p-4 bg-white space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Image Description (AI-generated)</label>
          <textarea
            value={content.imageDescription}
            onChange={(e) =>
              onEdit({
                ...content,
                imageDescription: e.target.value,
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            rows={2}
            placeholder="Describe what image should be shown..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Image URL (optional - add your own image)</label>
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
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Alt Text (for accessibility)</label>
          <input
            type="text"
            value={content.altText}
            onChange={(e) =>
              onEdit({
                ...content,
                altText: e.target.value,
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Describe the image for screen readers..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Caption (optional)</label>
          <input
            type="text"
            value={content.caption || ''}
            onChange={(e) =>
              onEdit({
                ...content,
                caption: e.target.value || undefined,
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Add a caption..."
          />
        </div>
        {hasRealUrl && (
          <div className="pt-2 border-t">
            <p className="text-xs text-gray-500 mb-2">Preview:</p>
            <div className="relative max-w-md">
              {!imageError ? (
                <img
                  src={content.url}
                  alt={content.altText || 'Preview'}
                  onError={() => setImageError(true)}
                  className="max-w-full h-auto rounded-lg shadow"
                />
              ) : (
                <div className="p-4 bg-gray-100 rounded-lg text-center text-sm text-gray-500">
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
        <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border-2 border-dashed border-indigo-200">
          <div className="flex items-start gap-4">
            {/* Image icon */}
            <div className="flex-shrink-0 p-3 bg-white rounded-lg shadow-sm">
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
              <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">
                Image Placeholder
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {content.imageDescription || content.altText || 'An image will be added here'}
              </p>
              {content.caption && (
                <p className="mt-2 text-xs text-gray-500 italic">{content.caption}</p>
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
        <figcaption className="mt-2 text-center text-sm text-gray-500 italic">{content.caption}</figcaption>
      )}
    </figure>
  );
}
