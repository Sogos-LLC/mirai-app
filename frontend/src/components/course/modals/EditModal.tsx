'use client';

import { useCourseEditorStore } from '@/store/zustand/courseEditorStore';
import { LessonComponentType } from '@/gen/mirai/v1/ai_generation_pb';
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
};

export function EditModal() {
  const editingComponent = useCourseEditorStore((s) => s.editingComponent);
  const closeEditModal = useCourseEditorStore((s) => s.closeEditModal);
  const saveEditModal = useCourseEditorStore((s) => s.saveEditModal);

  if (!editingComponent) return null;

  const { component } = editingComponent;

  const handleSave = (contentJson: string) => {
    saveEditModal(contentJson);
  };

  const renderEditor = () => {
    switch (component.type) {
      case LessonComponentType.HEADING:
        return <HeadingEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.TEXT:
        return <TextEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.IMAGE:
        return (
          <ImageEditor
            contentJson={component.contentJson}
            onSave={handleSave}
            courseId={editingComponent.courseId}
            generatedLessonId={editingComponent.generatedLessonId}
            componentId={component.id}
          />
        );
      case LessonComponentType.CODE:
        return <CodeEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.CALLOUT:
        return <CalloutEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.QUIZ:
        return <QuizEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.STATEMENT:
        return <StatementEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.QUOTE:
        return <QuoteEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.LIST:
        return <ListEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.GALLERY:
        return <GalleryEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.MULTIMEDIA:
        return <MultimediaEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.CHART:
        return <ChartEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.DIVIDER:
        return <DividerEditor contentJson={component.contentJson} onSave={handleSave} />;
      default:
        return <div className="text-secondary">Unknown component type</div>;
    }
  };

  return (
    <ResponsiveModal
      isOpen={!!editingComponent}
      onClose={closeEditModal}
      title={`Edit ${COMPONENT_TYPE_LABELS[component.type] || 'Component'}`}
      size="xl"
      mobileHeight="full"
    >
      {renderEditor()}
    </ResponsiveModal>
  );
}
