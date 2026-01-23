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
      className="flex-1 overflow-y-auto text-lg leading-relaxed"
    >
      <div className="max-w-5xl mx-auto px-6 sm:px-10 lg:px-16 py-12">
        {/* Lesson header */}
        <FadeInView delay={0}>
          <div className="mb-12">
            <p className="text-lg text-muted mb-2">
              {lesson.sectionTitle} • Lesson {lesson.lessonIndex + 1}
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-primary">
              {lesson.title}
            </h1>
            {lesson.description && (
              <p className="text-xl text-secondary mt-4">
                {lesson.description}
              </p>
            )}
          </div>
        </FadeInView>

        {/* Components */}
        {components.length > 0 ? (
          <div className="space-y-8">
            {components.map((component, index) => (
              <FadeInView key={component.id || index} delay={(index + 1) * 50}>
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
