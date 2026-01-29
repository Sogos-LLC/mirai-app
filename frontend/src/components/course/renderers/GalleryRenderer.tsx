'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X, ImageIcon } from 'lucide-react';

export interface GalleryHotspot {
  id: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  label: string;
  description: string;
}

export interface GalleryItem {
  imageDescription: string;
  url?: string;
  altText: string;
  caption?: string;
  hotspots?: GalleryHotspot[];
}

export interface GalleryContent {
  style: string; // carousel, labeled_graphic
  items: GalleryItem[];
}

interface GalleryRendererProps {
  content: GalleryContent | Record<string, unknown>;
  isEditing?: boolean;
  onEdit?: (content: GalleryContent) => void;
}

export function GalleryRenderer({ content: rawContent, isEditing = false }: GalleryRendererProps) {
  const content = rawContent as GalleryContent;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<GalleryHotspot | null>(null);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? content.items.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === content.items.length - 1 ? 0 : prev + 1));
  };

  const renderImage = (item: GalleryItem, index: number) => {
    if (item.url) {
      return (
        <img
          src={item.url}
          alt={item.altText}
          className="w-full h-auto rounded-lg object-cover"
        />
      );
    }

    // Placeholder for images without URLs
    return (
      <div className="w-full aspect-video bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
        <div className="text-center text-slate-400 dark:text-slate-500 px-8">
          <ImageIcon className="w-12 h-12 mx-auto mb-2" />
          <p className="text-sm">{item.imageDescription}</p>
        </div>
      </div>
    );
  };

  if (content.style === 'carousel') {
    const currentItem = content.items[currentIndex];

    return (
      <div className="my-6">
        <div className="relative">
          <figure>
            {renderImage(currentItem, currentIndex)}
            {currentItem.caption && (
              <figcaption className="mt-2 text-sm text-center text-secondary">
                {currentItem.caption}
              </figcaption>
            )}
          </figure>

          {content.items.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                aria-label="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                aria-label="Next image"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Dots indicator */}
              <div className="flex justify-center gap-2 mt-4">
                {content.items.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === currentIndex
                        ? 'bg-purple-600'
                        : 'bg-slate-300 dark:bg-slate-600 hover:bg-slate-400'
                    }`}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Labeled graphic style
  if (content.style === 'labeled_graphic' && content.items.length > 0) {
    const item = content.items[0];

    return (
      <div className="my-6">
        <div className="relative inline-block w-full">
          {renderImage(item, 0)}

          {/* Hotspots */}
          {item.hotspots?.map((hotspot) => (
            <button
              key={hotspot.id}
              onClick={() => setActiveHotspot(activeHotspot?.id === hotspot.id ? null : hotspot)}
              className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110"
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
              aria-label={hotspot.label}
            >
              {hotspot.label.charAt(0)}
            </button>
          ))}

          {/* Active hotspot tooltip */}
          {activeHotspot && (
            <div
              className="absolute z-10 w-64 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-default"
              style={{
                left: `${Math.min(activeHotspot.x, 70)}%`,
                top: `${activeHotspot.y + 5}%`,
              }}
            >
              <button
                onClick={() => setActiveHotspot(null)}
                className="absolute right-1 top-1 p-1 text-muted hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
              <h5 className="font-semibold text-primary mb-1">{activeHotspot.label}</h5>
              <p className="text-sm text-secondary">{activeHotspot.description}</p>
            </div>
          )}
        </div>

        {item.caption && (
          <p className="mt-2 text-sm text-center text-secondary">{item.caption}</p>
        )}
      </div>
    );
  }

  // Fallback: simple grid
  return (
    <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      {content.items.map((item, idx) => (
        <figure key={idx}>
          {renderImage(item, idx)}
          {item.caption && (
            <figcaption className="mt-2 text-sm text-center text-secondary">
              {item.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
