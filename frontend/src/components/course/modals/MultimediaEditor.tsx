'use client';

import { useState } from 'react';
import { Play, Volume2, Zap, ExternalLink } from 'lucide-react';

interface MultimediaContent {
  type: string;
  url: string;
  title: string;
  description?: string;
  provider?: string;
  isPlaceholder?: boolean;
}

interface MultimediaEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

const MEDIA_TYPES = [
  { value: 'video', label: 'Video', icon: Play, description: 'YouTube, Vimeo, or direct video' },
  { value: 'audio', label: 'Audio', icon: Volume2, description: 'Podcast or audio file' },
  { value: 'interactive', label: 'Interactive', icon: Zap, description: 'Embed or iframe' },
];

export function MultimediaEditor({ contentJson, onSave }: MultimediaEditorProps) {
  const parsed = JSON.parse(contentJson) as MultimediaContent;
  const [type, setType] = useState(parsed.type || 'video');
  const [url, setUrl] = useState(parsed.url || '');
  const [title, setTitle] = useState(parsed.title || '');
  const [description, setDescription] = useState(parsed.description || '');
  const [isPlaceholder, setIsPlaceholder] = useState(parsed.isPlaceholder || false);

  const handleSave = () => {
    onSave(JSON.stringify({
      type,
      url: isPlaceholder ? 'https://placeholder.mirai.app/media' : url,
      title,
      description: description || undefined,
      isPlaceholder,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Media Type
        </label>
        <div className="grid grid-cols-3 gap-3">
          {MEDIA_TYPES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => setType(m.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  type === m.value
                    ? 'bg-purple-100 text-purple-600 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700'
                    : 'bg-hover text-muted border-transparent hover:border-subtle'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="font-medium text-sm">{m.label}</span>
                <span className="text-xs opacity-75 text-center">{m.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="e.g., Introduction Video, Podcast Episode 1"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-primary">
            {isPlaceholder ? 'Placeholder Mode' : 'Media URL'}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isPlaceholder}
              onChange={(e) => setIsPlaceholder(e.target.checked)}
              className="rounded"
            />
            <span className="text-muted">Use placeholder</span>
          </label>
        </div>
        {isPlaceholder ? (
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
            <p className="text-sm text-muted text-center">
              A placeholder will be shown. Replace with actual media URL later.
            </p>
          </div>
        ) : (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-4 py-3 bg-surface border border-default rounded-lg
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              text-primary placeholder:text-muted"
            placeholder={
              type === 'video'
                ? 'https://youtube.com/watch?v=... or https://vimeo.com/...'
                : type === 'audio'
                ? 'https://example.com/audio.mp3'
                : 'https://example.com/embed'
            }
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted resize-none"
          placeholder="Brief description of the media content..."
        />
      </div>

      {/* Preview */}
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Preview
        </label>
        <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center border border-default">
          {MEDIA_TYPES.find((m) => m.value === type)?.icon && (
            <>
              {type === 'video' && <Play className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-3" />}
              {type === 'audio' && <Volume2 className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-3" />}
              {type === 'interactive' && <Zap className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-3" />}
            </>
          )}
          <p className="font-semibold text-primary">{title || 'Media Title'}</p>
          {description && (
            <p className="text-sm text-secondary mt-1 max-w-md text-center px-4">{description}</p>
          )}
          {isPlaceholder && (
            <p className="text-xs text-muted mt-2">Placeholder - content to be added</p>
          )}
          {!isPlaceholder && url && (
            <p className="text-xs text-muted mt-2 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              {url.substring(0, 40)}...
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          disabled={!title.trim() || (!isPlaceholder && !url.trim())}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done
        </button>
      </div>
    </div>
  );
}
