'use client';

import { useState } from 'react';
import { Plus, Trash2, ImageIcon, Layers, Target } from 'lucide-react';

interface GalleryHotspot {
  id: string;
  x: number;
  y: number;
  label: string;
  description: string;
}

interface GalleryItem {
  imageDescription: string;
  url?: string;
  altText: string;
  caption?: string;
  hotspots?: GalleryHotspot[];
}

interface GalleryContent {
  style: string;
  items: GalleryItem[];
}

interface GalleryEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

const GALLERY_STYLES = [
  { value: 'carousel', label: 'Carousel', icon: Layers, description: 'Slideshow of images' },
  { value: 'labeled_graphic', label: 'Labeled Graphic', icon: Target, description: 'Image with clickable hotspots' },
];

export function GalleryEditor({ contentJson, onSave }: GalleryEditorProps) {
  const parsed = JSON.parse(contentJson) as GalleryContent;
  const [style, setStyle] = useState(parsed.style || 'carousel');
  const [items, setItems] = useState<GalleryItem[]>(
    parsed.items?.length ? parsed.items : [{ imageDescription: '', altText: '' }]
  );

  const handleSave = () => {
    onSave(JSON.stringify({
      style,
      items: items.filter((item) => item.imageDescription.trim() || item.url),
    }));
  };

  const addItem = () => {
    setItems([...items, { imageDescription: '', altText: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof GalleryItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addHotspot = (itemIndex: number) => {
    const updated = [...items];
    const hotspots = updated[itemIndex].hotspots || [];
    updated[itemIndex].hotspots = [
      ...hotspots,
      { id: `hs-${Date.now()}`, x: 50, y: 50, label: '', description: '' },
    ];
    setItems(updated);
  };

  const updateHotspot = (itemIndex: number, hotspotIndex: number, field: keyof GalleryHotspot, value: string | number) => {
    const updated = [...items];
    if (updated[itemIndex].hotspots) {
      updated[itemIndex].hotspots![hotspotIndex] = {
        ...updated[itemIndex].hotspots![hotspotIndex],
        [field]: value,
      };
      setItems(updated);
    }
  };

  const removeHotspot = (itemIndex: number, hotspotIndex: number) => {
    const updated = [...items];
    if (updated[itemIndex].hotspots) {
      updated[itemIndex].hotspots = updated[itemIndex].hotspots!.filter((_, i) => i !== hotspotIndex);
      setItems(updated);
    }
  };

  const isLabeledGraphic = style === 'labeled_graphic';

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          Gallery Style
        </label>
        <div className="grid grid-cols-2 gap-4">
          {GALLERY_STYLES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                  style === s.value
                    ? 'bg-purple-100 text-purple-600 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700'
                    : 'bg-hover text-muted border-transparent hover:border-subtle'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium block">{s.label}</span>
                  <span className="text-xs opacity-75">{s.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          {isLabeledGraphic ? 'Image' : 'Images'}
        </label>
        <div className="space-y-4">
          {items.slice(0, isLabeledGraphic ? 1 : items.length).map((item, index) => (
            <div key={index} className="p-4 bg-surface border border-default rounded-lg space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <ImageIcon className="w-4 h-4" />
                  <span>Image {index + 1}</span>
                </div>
                {!isLabeledGraphic && items.length > 1 && (
                  <button
                    onClick={() => removeItem(index)}
                    className="text-muted hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <input
                type="text"
                value={item.url || ''}
                onChange={(e) => updateItem(index, 'url', e.target.value)}
                className="w-full px-4 py-2 bg-surface border border-default rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                  text-primary placeholder:text-muted"
                placeholder="Image URL (optional)"
              />

              <input
                type="text"
                value={item.imageDescription}
                onChange={(e) => updateItem(index, 'imageDescription', e.target.value)}
                className="w-full px-4 py-2 bg-surface border border-default rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                  text-primary placeholder:text-muted"
                placeholder="Image description (for AI generation)"
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={item.altText}
                  onChange={(e) => updateItem(index, 'altText', e.target.value)}
                  className="px-4 py-2 bg-surface border border-default rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                    text-primary placeholder:text-muted"
                  placeholder="Alt text"
                />
                <input
                  type="text"
                  value={item.caption || ''}
                  onChange={(e) => updateItem(index, 'caption', e.target.value)}
                  className="px-4 py-2 bg-surface border border-default rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                    text-primary placeholder:text-muted"
                  placeholder="Caption (optional)"
                />
              </div>

              {/* Hotspots for labeled graphics */}
              {isLabeledGraphic && (
                <div className="mt-4 pt-4 border-t border-subtle">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-primary">Hotspots</span>
                    <button
                      onClick={() => addHotspot(index)}
                      className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
                    >
                      <Plus className="w-4 h-4" />
                      Add Hotspot
                    </button>
                  </div>
                  {item.hotspots?.map((hotspot, hsIndex) => (
                    <div key={hotspot.id} className="flex gap-2 items-start mb-2">
                      <input
                        type="text"
                        value={hotspot.label}
                        onChange={(e) => updateHotspot(index, hsIndex, 'label', e.target.value)}
                        className="w-24 px-2 py-1 bg-surface border border-default rounded text-sm
                          focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Label"
                      />
                      <input
                        type="number"
                        value={hotspot.x}
                        onChange={(e) => updateHotspot(index, hsIndex, 'x', parseFloat(e.target.value))}
                        className="w-16 px-2 py-1 bg-surface border border-default rounded text-sm
                          focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="X %"
                        min="0"
                        max="100"
                      />
                      <input
                        type="number"
                        value={hotspot.y}
                        onChange={(e) => updateHotspot(index, hsIndex, 'y', parseFloat(e.target.value))}
                        className="w-16 px-2 py-1 bg-surface border border-default rounded text-sm
                          focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Y %"
                        min="0"
                        max="100"
                      />
                      <input
                        type="text"
                        value={hotspot.description}
                        onChange={(e) => updateHotspot(index, hsIndex, 'description', e.target.value)}
                        className="flex-1 px-2 py-1 bg-surface border border-default rounded text-sm
                          focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Description"
                      />
                      <button
                        onClick={() => removeHotspot(index, hsIndex)}
                        className="p-1 text-muted hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {!isLabeledGraphic && (
          <button
            onClick={addItem}
            className="mt-3 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
          >
            <Plus className="w-4 h-4" />
            Add Image
          </button>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          disabled={items.every((item) => !item.imageDescription.trim() && !item.url)}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done
        </button>
      </div>
    </div>
  );
}
