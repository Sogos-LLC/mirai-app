'use client';

import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Type,
  Heading1,
  ImageIcon,
  HelpCircle,
  Code,
  AlertCircle,
  Quote,
  ListOrdered,
  GalleryHorizontal,
  PlayCircle,
  BarChart3,
  Minus,
  Sparkles,
  ArrowLeft,
  ListChecks,
  LucideIcon,
} from 'lucide-react';
import { LessonComponentType } from '@/gen/mirai/v1/component_enums_pb';
import type { LessonComponent } from '@/gen/mirai/v1/ai_generation_types_pb';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { HeadingEditor } from './HeadingEditor';
import { TextEditor } from './TextEditor';
import { ImageEditor } from './ImageEditor';
import { CodeEditor } from './CodeEditor';
import { CalloutEditor } from './CalloutEditor';
import { QuizEditor } from './QuizEditor';
import { StatementEditor } from './StatementEditor';
import { QuoteEditor } from './QuoteEditor';
import { ListEditor } from './ListEditor';
import { GalleryEditor } from './GalleryEditor';
import { MultimediaEditor } from './MultimediaEditor';
import { ChartEditor } from './ChartEditor';
import { DividerEditor } from './DividerEditor';
import { TaskListEditor } from './TaskListEditor';

interface ComponentTypeInfo {
  type: number;
  name: string;
  icon: LucideIcon;
  description: string;
}

const COMPONENT_TYPES: ComponentTypeInfo[] = [
  { type: LessonComponentType.HEADING, name: 'Heading', icon: Heading1, description: 'Section title or subtitle' },
  { type: LessonComponentType.TEXT, name: 'Text', icon: Type, description: 'Rich text paragraph' },
  { type: LessonComponentType.IMAGE, name: 'Image', icon: ImageIcon, description: 'Image with caption' },
  { type: LessonComponentType.QUIZ, name: 'Quiz', icon: HelpCircle, description: 'Multiple choice question' },
  { type: LessonComponentType.CODE, name: 'Code', icon: Code, description: 'Syntax highlighted code' },
  { type: LessonComponentType.CALLOUT, name: 'Callout', icon: AlertCircle, description: 'Info, tip, or warning box' },
  { type: LessonComponentType.STATEMENT, name: 'Statement', icon: Sparkles, description: 'Key takeaway highlight' },
  { type: LessonComponentType.QUOTE, name: 'Quote', icon: Quote, description: 'Expert quote with attribution' },
  { type: LessonComponentType.LIST, name: 'List', icon: ListOrdered, description: 'Bulleted, numbered, or process list' },
  { type: LessonComponentType.GALLERY, name: 'Gallery', icon: GalleryHorizontal, description: 'Image carousel or labeled graphic' },
  { type: LessonComponentType.MULTIMEDIA, name: 'Multimedia', icon: PlayCircle, description: 'Video or audio embed' },
  { type: LessonComponentType.CHART, name: 'Chart', icon: BarChart3, description: 'Data visualization' },
  { type: LessonComponentType.DIVIDER, name: 'Divider', icon: Minus, description: 'Visual section separator' },
  { type: LessonComponentType.TASK_LIST, name: 'Task List', icon: ListChecks, description: 'Interactive practice checklist' },
];

const COMPONENT_TYPE_LABELS: Record<number, string> = {
  [LessonComponentType.UNSPECIFIED]: 'Component',
  [LessonComponentType.TEXT]: 'Text Block',
  [LessonComponentType.HEADING]: 'Heading',
  [LessonComponentType.IMAGE]: 'Image',
  [LessonComponentType.QUIZ]: 'Quiz',
  [LessonComponentType.CODE]: 'Code Block',
  [LessonComponentType.CALLOUT]: 'Callout',
  [LessonComponentType.STATEMENT]: 'Statement',
  [LessonComponentType.QUOTE]: 'Quote',
  [LessonComponentType.LIST]: 'List',
  [LessonComponentType.GALLERY]: 'Gallery',
  [LessonComponentType.MULTIMEDIA]: 'Multimedia',
  [LessonComponentType.CHART]: 'Chart',
  [LessonComponentType.DIVIDER]: 'Divider',
  [LessonComponentType.TASK_LIST]: 'Task List',
};

function getDefaultContentForType(type: number): string {
  switch (type) {
    case LessonComponentType.HEADING:
      return JSON.stringify({ headingLevel: 2, headingText: '' });
    case LessonComponentType.TEXT:
      return JSON.stringify({ textHtml: '' });
    case LessonComponentType.IMAGE:
      return JSON.stringify({ imageDescription: '', imageAltText: '', imageCaption: '', url: '' });
    case LessonComponentType.QUIZ:
      return JSON.stringify({
        quizQuestion: '',
        quizOptions: [
          { id: 'a', text: '' },
          { id: 'b', text: '' },
        ],
        quizCorrectAnswerId: 'a',
        quizExplanation: '',
      });
    case LessonComponentType.CODE:
      return JSON.stringify({ language: 'javascript', code: '' });
    case LessonComponentType.CALLOUT:
      return JSON.stringify({ style: 'info', title: '', content: '' });
    case LessonComponentType.STATEMENT:
      return JSON.stringify({ statementText: '', statementSubtext: '' });
    case LessonComponentType.QUOTE:
      return JSON.stringify({ text: '', author: '', title: '', source: '' });
    case LessonComponentType.LIST:
      return JSON.stringify({ style: 'bulleted', items: [{ text: '' }], title: '' });
    case LessonComponentType.GALLERY:
      return JSON.stringify({ style: 'carousel', items: [] });
    case LessonComponentType.MULTIMEDIA:
      return JSON.stringify({ type: 'video', url: '', title: '', description: '' });
    case LessonComponentType.CHART:
      return JSON.stringify({ type: 'bar', title: '', series: [], description: '' });
    case LessonComponentType.DIVIDER:
      return JSON.stringify({});
    case LessonComponentType.TASK_LIST:
      return JSON.stringify({ title: 'Practice Time', emoji: '✏️', items: [{ id: 'a', contentHtml: '' }] });
    default:
      return JSON.stringify({});
  }
}

interface AddComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (component: LessonComponent, contentJson: string) => void;
  insertAfterIndex: number;
  courseId: string;
  lessonId: string;
}

type Phase = 'select' | 'edit';

export function AddComponentModal({
  isOpen,
  onClose,
  onAdd,
  insertAfterIndex,
  courseId,
  lessonId,
}: AddComponentModalProps) {
  const [phase, setPhase] = useState<Phase>('select');
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [newComponent, setNewComponent] = useState<LessonComponent | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('select');
      setSelectedType(null);
      setNewComponent(null);
      setIsTransitioning(false);
    }
  }, [isOpen]);

  const handleSelectType = useCallback((type: number) => {
    // Create the new component
    const component: LessonComponent = {
      id: uuidv4(),
      type,
      contentJson: getDefaultContentForType(type),
      order: insertAfterIndex + 1,
      $typeName: 'mirai.v1.LessonComponent',
    };

    setSelectedType(type);
    setNewComponent(component);

    // Start transition animation
    setIsTransitioning(true);
    setTimeout(() => {
      setPhase('edit');
      setIsTransitioning(false);
    }, 150);
  }, [insertAfterIndex]);

  const handleBack = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setPhase('select');
      setSelectedType(null);
      setNewComponent(null);
      setIsTransitioning(false);
    }, 150);
  }, []);

  const handleSave = useCallback((contentJson: string) => {
    if (newComponent) {
      onAdd(newComponent, contentJson);
    }
    onClose();
  }, [newComponent, onAdd, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const renderEditor = () => {
    if (!newComponent || selectedType === null) return null;

    const props = {
      contentJson: newComponent.contentJson,
      onSave: handleSave,
    };

    switch (selectedType) {
      case LessonComponentType.HEADING:
        return <HeadingEditor {...props} />;
      case LessonComponentType.TEXT:
        return <TextEditor {...props} />;
      case LessonComponentType.IMAGE:
        return (
          <ImageEditor
            {...props}
            courseId={courseId}
            generatedLessonId={lessonId}
            componentId={newComponent.id}
          />
        );
      case LessonComponentType.CODE:
        return <CodeEditor {...props} />;
      case LessonComponentType.CALLOUT:
        return <CalloutEditor {...props} />;
      case LessonComponentType.QUIZ:
        return <QuizEditor {...props} />;
      case LessonComponentType.STATEMENT:
        return <StatementEditor {...props} />;
      case LessonComponentType.QUOTE:
        return <QuoteEditor {...props} />;
      case LessonComponentType.LIST:
        return <ListEditor {...props} />;
      case LessonComponentType.GALLERY:
        return <GalleryEditor {...props} />;
      case LessonComponentType.MULTIMEDIA:
        return <MultimediaEditor {...props} />;
      case LessonComponentType.CHART:
        return <ChartEditor {...props} />;
      case LessonComponentType.DIVIDER:
        return <DividerEditor {...props} />;
      case LessonComponentType.TASK_LIST:
        return <TaskListEditor {...props} />;
      default:
        return <div className="text-secondary">Unknown component type</div>;
    }
  };

  const title = phase === 'select'
    ? 'Add Component'
    : `Add ${COMPONENT_TYPE_LABELS[selectedType ?? 0] || 'Component'}`;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size={phase === 'select' ? 'lg' : 'xl'}
      mobileHeight="full"
    >
      {/* Outer container with negative margin to compensate for inner padding */}
      <div className="relative overflow-hidden -mx-1">
        {/* Selection Phase */}
        <div
          className={`
            transition-all duration-200 ease-out px-1
            ${phase === 'select' && !isTransitioning
              ? 'opacity-100 translate-x-0'
              : phase === 'select' && isTransitioning
              ? 'opacity-0 -translate-x-4'
              : 'opacity-0 -translate-x-8 absolute inset-0 pointer-events-none'
            }
          `}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COMPONENT_TYPES.map(({ type, name, icon: Icon, description }) => (
              <button
                key={type}
                onClick={() => handleSelectType(type)}
                className="flex items-start gap-3 p-4 text-left bg-surface border border-default rounded-lg hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-800/40 transition-colors">
                  <Icon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-primary">{name}</h4>
                  <p className="text-sm text-muted mt-0.5 line-clamp-2">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Edit Phase */}
        <div
          className={`
            transition-all duration-200 ease-out px-1
            ${phase === 'edit' && !isTransitioning
              ? 'opacity-100 translate-x-0'
              : phase === 'edit' && isTransitioning
              ? 'opacity-0 translate-x-4'
              : 'opacity-0 translate-x-8 absolute inset-0 pointer-events-none'
            }
          `}
        >
          {phase === 'edit' && (
            <>
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-sm text-secondary hover:text-primary mb-4 -mt-1 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to component types
              </button>
              {renderEditor()}
            </>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
