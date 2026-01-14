'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, List, ListOrdered, CheckSquare, ArrowRight, ChevronDown } from 'lucide-react';

interface ListItem {
  text: string;
  icon?: string;
  description?: string;
}

interface ListContent {
  style: string;
  items: ListItem[];
  title?: string;
}

interface ListEditorProps {
  contentJson: string;
  onSave: (contentJson: string) => void;
}

const LIST_STYLES = [
  { value: 'bulleted', label: 'Bulleted', icon: List },
  { value: 'numbered', label: 'Numbered', icon: ListOrdered },
  { value: 'icon', label: 'With Icons', icon: CheckSquare },
  { value: 'process', label: 'Process', icon: ArrowRight },
  { value: 'accordion', label: 'Accordion', icon: ChevronDown },
];

export function ListEditor({ contentJson, onSave }: ListEditorProps) {
  const parsed = JSON.parse(contentJson) as ListContent;
  const [style, setStyle] = useState(parsed.style || 'bulleted');
  const [title, setTitle] = useState(parsed.title || '');
  const [items, setItems] = useState<ListItem[]>(
    parsed.items?.length ? parsed.items : [{ text: '' }]
  );

  const handleSave = () => {
    onSave(JSON.stringify({
      style,
      items: items.filter((item) => item.text.trim()),
      title: title || undefined,
    }));
  };

  const addItem = () => {
    setItems([...items, { text: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ListItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const showIcon = style === 'icon';
  const showDescription = style === 'process' || style === 'accordion';

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          List Style
        </label>
        <div className="grid grid-cols-5 gap-2">
          {LIST_STYLES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                  style === s.value
                    ? 'bg-purple-100 text-purple-600 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700'
                    : 'bg-hover text-muted border-transparent hover:border-subtle'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          List Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 bg-surface border border-default rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-primary placeholder:text-muted"
          placeholder="Optional list header..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-2">
          List Items
        </label>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-shrink-0 pt-3 text-muted">
                <GripVertical className="w-4 h-4" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  {showIcon && (
                    <input
                      type="text"
                      value={item.icon || ''}
                      onChange={(e) => updateItem(index, 'icon', e.target.value)}
                      className="w-16 px-3 py-2 bg-surface border border-default rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                        text-primary placeholder:text-muted text-center"
                      placeholder="🔹"
                    />
                  )}
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => updateItem(index, 'text', e.target.value)}
                    className="flex-1 px-4 py-2 bg-surface border border-default rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                      text-primary placeholder:text-muted"
                    placeholder={`Item ${index + 1}...`}
                  />
                  <button
                    onClick={() => removeItem(index)}
                    disabled={items.length <= 1}
                    className="p-2 text-muted hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {showDescription && (
                  <textarea
                    value={item.description || ''}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 bg-surface border border-default rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                      text-primary placeholder:text-muted resize-none text-sm"
                    placeholder="Additional description..."
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={addItem}
          className="mt-3 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
        <button
          onClick={handleSave}
          disabled={items.every((item) => !item.text.trim())}
          className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg
            hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
