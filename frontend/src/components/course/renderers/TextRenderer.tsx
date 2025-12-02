'use client';

interface TextContent {
  html: string;
  plaintext: string;
}

interface TextRendererProps {
  content: TextContent;
  isEditing?: boolean;
  onEdit?: (content: TextContent) => void;
}

export function TextRenderer({ content, isEditing = false, onEdit }: TextRendererProps) {
  if (isEditing && onEdit) {
    return (
      <div className="border rounded-lg p-4 bg-white">
        <textarea
          className="w-full min-h-[100px] p-2 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          value={content.html}
          onChange={(e) =>
            onEdit({
              ...content,
              html: e.target.value,
              plaintext: e.target.value.replace(/<[^>]*>/g, ''),
            })
          }
          placeholder="Enter text content..."
        />
        <p className="mt-2 text-xs text-gray-500">
          Supports HTML formatting. Plain text will be extracted automatically.
        </p>
      </div>
    );
  }

  return (
    <div
      className="prose prose-sm sm:prose lg:prose-lg max-w-none text-gray-700"
      dangerouslySetInnerHTML={{ __html: content.html || content.plaintext }}
    />
  );
}
