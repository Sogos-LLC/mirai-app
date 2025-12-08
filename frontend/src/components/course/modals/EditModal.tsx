'use client';

import { X } from 'lucide-react';
import { useCourseEditorStore } from '@/store/zustand/courseEditorStore';
import { LessonComponentType } from '@/gen/mirai/v1/ai_generation_pb';
import { HeadingEditor } from './HeadingEditor';
import { TextEditor } from './TextEditor';
import { ImageEditor } from './ImageEditor';
import { CodeEditor } from './CodeEditor';
import { CalloutEditor } from './CalloutEditor';
import { QuizEditor } from './QuizEditor';

const COMPONENT_TYPE_LABELS: Record<number, string> = {
  [LessonComponentType.UNSPECIFIED]: 'Component',
  [LessonComponentType.TEXT]: 'Text Block',
  [LessonComponentType.HEADING]: 'Heading',
  [LessonComponentType.IMAGE]: 'Image',
  [LessonComponentType.QUIZ]: 'Quiz',
  [LessonComponentType.CODE]: 'Code Block',
  [LessonComponentType.CALLOUT]: 'Callout',
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
        return <ImageEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.CODE:
        return <CodeEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.CALLOUT:
        return <CalloutEditor contentJson={component.contentJson} onSave={handleSave} />;
      case LessonComponentType.QUIZ:
        return <QuizEditor contentJson={component.contentJson} onSave={handleSave} />;
      default:
        return <div className="text-secondary">Unknown component type</div>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeEditModal}
      />

      {/* Modal */}
      <div className="relative bg-surface rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <h2 className="text-lg font-semibold text-primary">
            Edit {COMPONENT_TYPE_LABELS[component.type] || 'Component'}
          </h2>
          <button
            onClick={closeEditModal}
            className="p-2 text-muted hover:text-primary hover:bg-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {renderEditor()}
        </div>
      </div>
    </div>
  );
}
