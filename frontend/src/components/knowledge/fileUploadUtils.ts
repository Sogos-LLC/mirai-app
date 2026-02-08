/**
 * Shared types and utilities for knowledge file uploads.
 */

export interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/plain',
  'text/markdown',
];

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

export const SUPPORTED_ACCEPT = '.pdf,.docx,.txt,.md';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`;
  return `~${Math.round(tokens / 1000)}k tokens`;
}

/** Strip markdown syntax to produce clean plain text for previews. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // # headings
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/\*(.+?)\*/g, '$1')       // *italic*
    .replace(/__(.+?)__/g, '$1')       // __bold__
    .replace(/_(.+?)_/g, '$1')         // _italic_
    .replace(/~~(.+?)~~/g, '$1')       // ~~strikethrough~~
    .replace(/`(.+?)`/g, '$1')         // `code`
    .replace(/^---+$/gm, '')           // horizontal rules
    .replace(/^\s*[-*+]\s+/gm, '')     // list markers
    .replace(/^\s*\d+\.\s+/gm, '')     // numbered lists
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // [links](url)
    .replace(/!\[.*?\]\(.+?\)/g, '')   // ![images](url)
    .replace(/^>\s+/gm, '')            // > blockquotes
    .replace(/\n{2,}/g, ' ')           // collapse multiple newlines
    .replace(/\n/g, ' ')               // remaining newlines to spaces
    .trim();
}

/** Render basic markdown to HTML for preview display. */
export function renderMarkdownHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---+$/gm, '<hr/>')
    .replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br/>');
}

export function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validate files against supported types and check for duplicates.
 * Returns valid files and invalid file names.
 */
export function validateFiles(
  files: File[],
  existingNames: Set<string>,
): { valid: PendingFile[]; invalidNames: string[] } {
  const valid: PendingFile[] = [];
  const invalidNames: string[] = [];

  for (const file of files) {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = SUPPORTED_TYPES.includes(file.type) || SUPPORTED_EXTENSIONS.includes(ext);

    if (!isValidType) {
      invalidNames.push(file.name);
      continue;
    }

    if (!existingNames.has(file.name)) {
      valid.push({
        id: generateFileId(),
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        status: 'pending',
      });
    }
  }

  return { valid, invalidNames };
}
