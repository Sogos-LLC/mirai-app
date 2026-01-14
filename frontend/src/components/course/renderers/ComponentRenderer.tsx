'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { MoreVertical, RefreshCw } from 'lucide-react';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_pb';
import { LessonComponentType } from '@/gen/mirai/v1/ai_generation_pb';
import type {
  TextContent,
  HeadingContent,
  ImageContent,
  QuizContent,
  CodeContent,
  CalloutContent,
} from '@/gen/mirai/v1/ai_generation_zod';
import type { StatementContent } from '@/gen/mirai/v1/ai_generation_pb';
import { TextRenderer } from './TextRenderer';
import { HeadingRenderer } from './HeadingRenderer';
import { ImageRenderer } from './ImageRenderer';
import { QuizRenderer } from './QuizRenderer';
import { CodeRenderer } from './CodeRenderer';
import { CalloutRenderer } from './CalloutRenderer';
import { StatementRenderer } from './StatementRenderer';
import { QuoteRenderer } from './QuoteRenderer';
import { ListRenderer } from './ListRenderer';
import { GalleryRenderer } from './GalleryRenderer';
import { MultimediaRenderer } from './MultimediaRenderer';
import { ChartRenderer } from './ChartRenderer';
import { DividerRenderer } from './DividerRenderer';

// Component type enum values from proto
const COMPONENT_TYPES = {
  UNSPECIFIED: LessonComponentType.UNSPECIFIED,
  TEXT: LessonComponentType.TEXT,
  HEADING: LessonComponentType.HEADING,
  IMAGE: LessonComponentType.IMAGE,
  QUIZ: LessonComponentType.QUIZ,
  CODE: LessonComponentType.CODE,
  CALLOUT: LessonComponentType.CALLOUT,
  STATEMENT: LessonComponentType.STATEMENT,
  QUOTE: LessonComponentType.QUOTE,
  LIST: LessonComponentType.LIST,
  GALLERY: LessonComponentType.GALLERY,
  MULTIMEDIA: LessonComponentType.MULTIMEDIA,
  CHART: LessonComponentType.CHART,
  DIVIDER: LessonComponentType.DIVIDER,
} as const;

// Quiz option interface for normalization
interface QuizOption {
  id: string;
  text: string;
}

interface ComponentRendererProps {
  component: LessonComponent;
  isEditing?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onUpdate?: (contentJson: string) => void;
  onQuizAnswer?: (componentId: string, optionId: string, isCorrect: boolean) => void;
  onOpenRealignment?: (component: LessonComponent) => void;
}

function parseContent<T>(contentJson: string): T | null {
  try {
    return JSON.parse(contentJson) as T;
  } catch {
    return null;
  }
}

// Transform snake_case quiz JSON to camelCase
function normalizeQuizContent(raw: Record<string, unknown>): QuizContent {
  return {
    question: (raw.question as string) || '',
    questionType: (raw.questionType as string) || (raw.question_type as string) || 'multiple_choice',
    options: (raw.options as QuizOption[]) || [],
    correctAnswerId: (raw.correctAnswerId as string) || (raw.correct_answer_id as string) || '',
    explanation: (raw.explanation as string) || '',
  };
}

export function ComponentRenderer({
  component,
  isEditing = false,
  isSelected = false,
  onSelect,
  onUpdate,
  onQuizAnswer,
  onOpenRealignment,
}: ComponentRendererProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const content = useMemo(() => {
    return parseContent<Record<string, unknown>>(component.contentJson);
  }, [component.contentJson]);

  const handleUpdate = (newContent: unknown) => {
    onUpdate?.(JSON.stringify(newContent));
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleRealignmentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onOpenRealignment?.(component);
  };

  // Check if this component type should show the menu (all except IMAGE)
  const showRealignmentMenu = onOpenRealignment && component.type !== COMPONENT_TYPES.IMAGE;

  // Wrapper for selectable/editable state
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    if (isEditing || onSelect || showRealignmentMenu) {
      return (
        <div
          className={`
            relative group
            ${onSelect ? 'cursor-pointer' : ''}
            ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 rounded-lg' : ''}
          `}
          onClick={() => !isEditing && onSelect?.()}
        >
          {children}

          {/* 3-dot menu for realignment */}
          {showRealignmentMenu && (
            <div
              ref={menuRef}
              className="absolute top-2 right-2 z-10"
            >
              <button
                onClick={handleMenuClick}
                className={`
                  p-2 rounded-lg transition-all
                  bg-white dark:bg-dark-surface
                  border border-gray-200 dark:border-dark-border
                  shadow-sm hover:shadow
                  text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white
                  opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100
                  touch-device:opacity-100
                  ${showMenu ? 'opacity-100' : ''}
                `}
                aria-label="Component options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Dropdown menu */}
              {showMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white dark:bg-dark-surface-elevated border border-gray-200 dark:border-dark-border rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button
                    onClick={handleRealignmentClick}
                    className="w-full px-4 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-dark-400 text-gray-700 dark:text-gray-200"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Realignment
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return <>{children}</>;
  };

  // Render based on component type
  switch (component.type) {
    case COMPONENT_TYPES.TEXT: {
      const textContent = content as TextContent | null;
      if (!textContent) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid text content</div>;
      }
      return (
        <Wrapper>
          <TextRenderer
            content={textContent}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.HEADING: {
      const headingContent = content as HeadingContent | null;
      if (!headingContent) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid heading content</div>;
      }
      return (
        <Wrapper>
          <HeadingRenderer
            content={headingContent}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.IMAGE: {
      const imageContent = content as ImageContent | null;
      if (!imageContent) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid image content</div>;
      }
      return (
        <Wrapper>
          <ImageRenderer
            content={imageContent}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.QUIZ: {
      if (!content) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid quiz content</div>;
      }
      const quizContent = normalizeQuizContent(content);
      return (
        <Wrapper>
          <QuizRenderer
            content={quizContent}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
            onAnswer={(optionId, isCorrect) => onQuizAnswer?.(component.id, optionId, isCorrect)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.CODE: {
      const codeContent = content as CodeContent | null;
      if (!codeContent) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid code content</div>;
      }
      return (
        <Wrapper>
          <CodeRenderer
            content={codeContent}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.CALLOUT: {
      const calloutContent = content as CalloutContent | null;
      if (!calloutContent) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid callout content</div>;
      }
      return (
        <Wrapper>
          <CalloutRenderer
            content={calloutContent}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.STATEMENT: {
      const statementContent = content as StatementContent | null;
      if (!statementContent) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid statement content</div>;
      }
      return (
        <Wrapper>
          <StatementRenderer
            content={statementContent}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.QUOTE: {
      if (!content) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid quote content</div>;
      }
      return (
        <Wrapper>
          <QuoteRenderer
            content={content}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.LIST: {
      if (!content) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid list content</div>;
      }
      return (
        <Wrapper>
          <ListRenderer
            content={content}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.GALLERY: {
      if (!content) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid gallery content</div>;
      }
      return (
        <Wrapper>
          <GalleryRenderer
            content={content}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.MULTIMEDIA: {
      if (!content) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid multimedia content</div>;
      }
      return (
        <Wrapper>
          <MultimediaRenderer
            content={content}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.CHART: {
      if (!content) {
        return <div className="p-4 bg-red-50 text-red-700 rounded">Invalid chart content</div>;
      }
      return (
        <Wrapper>
          <ChartRenderer
            content={content}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    case COMPONENT_TYPES.DIVIDER: {
      return (
        <Wrapper>
          <DividerRenderer
            content={content || {}}
            isEditing={isEditing}
            onEdit={(c) => handleUpdate(c)}
          />
        </Wrapper>
      );
    }

    default:
      return (
        <div className="p-4 bg-gray-100 text-gray-500 rounded">
          Unknown component type: {component.type}
        </div>
      );
  }
}

/**
 * Get the display name for a component type
 */
export function getComponentTypeName(type: number): string {
  const names: Record<number, string> = {
    [COMPONENT_TYPES.UNSPECIFIED]: 'Unknown',
    [COMPONENT_TYPES.TEXT]: 'Text',
    [COMPONENT_TYPES.HEADING]: 'Heading',
    [COMPONENT_TYPES.IMAGE]: 'Image',
    [COMPONENT_TYPES.QUIZ]: 'Quiz',
    [COMPONENT_TYPES.CODE]: 'Code',
    [COMPONENT_TYPES.CALLOUT]: 'Callout',
    [COMPONENT_TYPES.STATEMENT]: 'Statement',
    [COMPONENT_TYPES.QUOTE]: 'Quote',
    [COMPONENT_TYPES.LIST]: 'List',
    [COMPONENT_TYPES.GALLERY]: 'Gallery',
    [COMPONENT_TYPES.MULTIMEDIA]: 'Multimedia',
    [COMPONENT_TYPES.CHART]: 'Chart',
    [COMPONENT_TYPES.DIVIDER]: 'Divider',
  };
  return names[type] || 'Unknown';
}

/**
 * Get an icon for a component type
 */
export function getComponentTypeIcon(type: number): string {
  const icons: Record<number, string> = {
    [COMPONENT_TYPES.UNSPECIFIED]: '?',
    [COMPONENT_TYPES.TEXT]: 'T',
    [COMPONENT_TYPES.HEADING]: 'H',
    [COMPONENT_TYPES.IMAGE]: 'I',
    [COMPONENT_TYPES.QUIZ]: 'Q',
    [COMPONENT_TYPES.CODE]: '<>',
    [COMPONENT_TYPES.CALLOUT]: '!',
    [COMPONENT_TYPES.STATEMENT]: '*',
    [COMPONENT_TYPES.QUOTE]: '"',
    [COMPONENT_TYPES.LIST]: '=',
    [COMPONENT_TYPES.GALLERY]: 'G',
    [COMPONENT_TYPES.MULTIMEDIA]: 'M',
    [COMPONENT_TYPES.CHART]: 'C',
    [COMPONENT_TYPES.DIVIDER]: '-',
  };
  return icons[type] || '?';
}
