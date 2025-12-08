'use client';

import { useMemo } from 'react';
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
import { TextRenderer } from './TextRenderer';
import { HeadingRenderer } from './HeadingRenderer';
import { ImageRenderer } from './ImageRenderer';
import { QuizRenderer } from './QuizRenderer';
import { CodeRenderer } from './CodeRenderer';
import { CalloutRenderer } from './CalloutRenderer';

// Component type enum values from proto
const COMPONENT_TYPES = {
  UNSPECIFIED: LessonComponentType.UNSPECIFIED,
  TEXT: LessonComponentType.TEXT,
  HEADING: LessonComponentType.HEADING,
  IMAGE: LessonComponentType.IMAGE,
  QUIZ: LessonComponentType.QUIZ,
  CODE: LessonComponentType.CODE,
  CALLOUT: LessonComponentType.CALLOUT,
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
}: ComponentRendererProps) {
  const content = useMemo(() => {
    return parseContent<Record<string, unknown>>(component.contentJson);
  }, [component.contentJson]);

  const handleUpdate = (newContent: unknown) => {
    onUpdate?.(JSON.stringify(newContent));
  };

  // Wrapper for selectable/editable state
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    if (isEditing || onSelect) {
      return (
        <div
          className={`
            relative
            ${onSelect ? 'cursor-pointer' : ''}
            ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 rounded-lg' : ''}
          `}
          onClick={() => !isEditing && onSelect?.()}
        >
          {children}
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
  };
  return icons[type] || '?';
}
