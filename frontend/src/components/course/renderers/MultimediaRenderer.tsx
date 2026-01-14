'use client';

import React from 'react';
import { Play, Volume2, ExternalLink } from 'lucide-react';

export interface MultimediaContent {
  type: string; // video, audio, interactive
  url: string;
  title: string;
  description?: string;
  provider?: string; // youtube, vimeo, soundcloud, etc.
  isPlaceholder?: boolean;
}

interface MultimediaRendererProps {
  content: MultimediaContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: MultimediaContent) => void;
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&]+)/);
  return match ? match[1] : null;
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

export function MultimediaRenderer({ content: rawContent, isEditing = false }: MultimediaRendererProps) {
  const content = rawContent as MultimediaContent;

  // Placeholder state
  if (content.isPlaceholder) {
    return (
      <div className="my-6">
        <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600">
          <Play className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-3" />
          <h4 className="font-semibold text-primary mb-1">{content.title}</h4>
          {content.description && (
            <p className="text-sm text-secondary max-w-md text-center px-4">
              {content.description}
            </p>
          )}
          <p className="text-xs text-muted mt-2">Media placeholder - content to be added</p>
        </div>
      </div>
    );
  }

  // Video type
  if (content.type === 'video') {
    const youtubeId = extractYouTubeId(content.url);
    const vimeoId = extractVimeoId(content.url);

    if (youtubeId) {
      return (
        <div className="my-6">
          <div className="aspect-video rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={content.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
          {content.description && (
            <p className="mt-2 text-sm text-secondary">{content.description}</p>
          )}
        </div>
      );
    }

    if (vimeoId) {
      return (
        <div className="my-6">
          <div className="aspect-video rounded-lg overflow-hidden">
            <iframe
              src={`https://player.vimeo.com/video/${vimeoId}`}
              title={content.title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
          {content.description && (
            <p className="mt-2 text-sm text-secondary">{content.description}</p>
          )}
        </div>
      );
    }

    // Fallback to video element
    return (
      <div className="my-6">
        <video controls className="w-full rounded-lg">
          <source src={content.url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {content.description && (
          <p className="mt-2 text-sm text-secondary">{content.description}</p>
        )}
      </div>
    );
  }

  // Audio type
  if (content.type === 'audio') {
    return (
      <div className="my-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
        <div className="flex items-center gap-3 mb-3">
          <Volume2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          <h4 className="font-semibold text-primary">{content.title}</h4>
        </div>
        <audio controls className="w-full">
          <source src={content.url} type="audio/mpeg" />
          Your browser does not support the audio tag.
        </audio>
        {content.description && (
          <p className="mt-2 text-sm text-secondary">{content.description}</p>
        )}
      </div>
    );
  }

  // Interactive type (iframe embed)
  if (content.type === 'interactive') {
    return (
      <div className="my-6">
        <div className="aspect-video rounded-lg overflow-hidden border border-default">
          <iframe
            src={content.url}
            title={content.title}
            className="w-full h-full"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
        {content.description && (
          <p className="mt-2 text-sm text-secondary">{content.description}</p>
        )}
      </div>
    );
  }

  // Fallback: link
  return (
    <div className="my-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:underline"
      >
        <ExternalLink className="w-5 h-5" />
        <span>{content.title}</span>
      </a>
      {content.description && (
        <p className="mt-2 text-sm text-secondary">{content.description}</p>
      )}
    </div>
  );
}
