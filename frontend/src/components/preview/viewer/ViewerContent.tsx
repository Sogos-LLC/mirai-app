'use client';

import { useEffect, useRef } from 'react';
import { ComponentRenderer } from '@/components/course/renderers/ComponentRenderer';
import { FadeInView } from '../shared/FadeInView';
import type { FlattenedLesson } from '@/hooks/usePreviewData';

interface ViewerContentProps {
  lesson: FlattenedLesson;
}

export function ViewerContent({ lesson }: ViewerContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to top when lesson changes
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [lesson.globalIndex]);

  const components = lesson.content?.components ?? [];

  return (
    <main
      ref={containerRef}
      className="flex-1 overflow-y-auto"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Lesson header */}
        <FadeInView delay={0}>
          <div className="mb-8">
            <p className="text-sm text-muted mb-1">
              {lesson.sectionTitle} • Lesson {lesson.lessonIndex + 1}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-primary">
              {lesson.title}
            </h1>
            {lesson.description && (
              <p className="text-lg text-secondary mt-3">
                {lesson.description}
              </p>
            )}
          </div>
        </FadeInView>

        {/* Components */}
        {components.length > 0 ? (
          <div className="space-y-6">
            {components.map((component, index) => (
              <FadeInView key={component.id || index} delay={(index + 1) * 100}>
                <ComponentRenderer component={component} />
              </FadeInView>
            ))}
          </div>
        ) : (
          <FadeInView delay={100}>
            <div className="text-center py-12 text-muted">
              <p>No content available for this lesson.</p>
            </div>
          </FadeInView>
        )}
      </div>
    </main>
  );
}
