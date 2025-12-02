'use client';

interface HeadingContent {
  level: number;
  text: string;
}

interface HeadingRendererProps {
  content: HeadingContent;
  isEditing?: boolean;
  onEdit?: (content: HeadingContent) => void;
}

const HEADING_STYLES: Record<number, string> = {
  1: 'text-3xl font-bold text-gray-900',
  2: 'text-2xl font-semibold text-gray-900',
  3: 'text-xl font-semibold text-gray-800',
  4: 'text-lg font-medium text-gray-800',
};

const LEVEL_OPTIONS = [
  { value: 1, label: 'H1 - Main Heading' },
  { value: 2, label: 'H2 - Section Heading' },
  { value: 3, label: 'H3 - Subsection' },
  { value: 4, label: 'H4 - Minor Heading' },
];

export function HeadingRenderer({ content, isEditing = false, onEdit }: HeadingRendererProps) {
  // Ensure valid heading level (1-4)
  const level = Math.min(Math.max(content.level || 2, 1), 4);
  const style = HEADING_STYLES[level];

  if (isEditing && onEdit) {
    return (
      <div className="border rounded-lg p-4 bg-white space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Heading Level</label>
          <select
            value={content.level}
            onChange={(e) =>
              onEdit({
                ...content,
                level: parseInt(e.target.value, 10),
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Heading Text</label>
          <input
            type="text"
            value={content.text}
            onChange={(e) =>
              onEdit({
                ...content,
                text: e.target.value,
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter heading text..."
          />
        </div>
        <div className="pt-2 border-t">
          <p className="text-xs text-gray-500 mb-2">Preview:</p>
          <p className={HEADING_STYLES[content.level] || HEADING_STYLES[1]}>{content.text || 'Heading text...'}</p>
        </div>
      </div>
    );
  }

  // Render appropriate heading tag based on level
  const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;

  return <HeadingTag className={style}>{content.text}</HeadingTag>;
}
