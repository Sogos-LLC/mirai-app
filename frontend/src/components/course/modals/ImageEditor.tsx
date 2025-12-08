'use client';

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface ImageContent {
  imageDescription: string;
  altText: string;
  caption?: string;
  url?: string;
}

interface ImageEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

export function ImageEditor({ contentJson, onSave }: ImageEditorProps) {
  const parsed = JSON.parse(contentJson) as ImageContent;
  const [url, setUrl] = useState(parsed.url || '');
  const [altText, setAltText] = useState(parsed.altText || '');
  const [caption, setCaption] = useState(parsed.caption || '');
  const [imageDescription] = useState(parsed.imageDescription || '');

  const handleSave = () => {
    onSave(JSON.stringify({
      imageDescription,
      altText,
      caption: caption || undefined,
      url: url || undefined,
    }));
  };

  return (
    <div className="space-y-6">
      {/* AI-generated description (read-only) */}
      {imageDescription && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
            AI-suggested image:
          </p>
          <p className="text-sm text-purple-600 dark:text-purple-400">{imageDescription}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Image URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="https://example.com/image.jpg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Alt Text (for accessibility)
        </label>
        <input
          type="text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Describe the image for screen readers..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Caption (optional)
        </label>
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Figure 1: Description..."
        />
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="p-4 bg-hover rounded-lg">
          {url ? (
            <figure>
              <img
                src={url}
                alt={altText}
                className="max-w-full h-auto rounded-lg mx-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
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
              <p className="text-sm">No image URL provided</p>
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
          Save Changes
        </button>
      </div>
    </div>
  );
}
