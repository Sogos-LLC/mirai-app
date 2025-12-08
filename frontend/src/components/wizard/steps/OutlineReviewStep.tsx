'use client';

import React from 'react';
import { ClipboardList, RefreshCw, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { CourseOutline, OutlineSection } from '@/gen/mirai/v1/ai_generation_pb';
import WizardNavigation from '../WizardNavigation';

interface OutlineReviewStepProps {
  outline: CourseOutline | null;
  onApprove: () => void;
  onRegenerate: () => void;
  onBack: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function OutlineReviewStep({
  outline,
  onApprove,
  onRegenerate,
  onBack,
  onCancel,
  isLoading = false,
}: OutlineReviewStepProps) {
  const [expandedSections, setExpandedSections] = React.useState<Set<number>>(
    new Set(outline?.sections?.map((_, i) => i) ?? [])
  );

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  const totalLessons = outline?.sections?.reduce(
    (acc, section) => acc + (section.lessons?.length ?? 0),
    0
  ) ?? 0;

  if (!outline) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-secondary">No outline available. Please try regenerating.</p>
          <Button
            variant="primary"
            onClick={onRegenerate}
            className="mt-4"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Outline
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-primary">
                  Review Your Course Outline
                </h2>
                <p className="text-secondary">
                  {outline.sections?.length ?? 0} sections • {totalLessons} lessons
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          </div>

          {/* Outline Preview */}
          <div className="border rounded-lg divide-y mb-6">
            {outline.sections?.map((section, sectionIndex) => (
              <div key={sectionIndex} className="bg-surface">
                <button
                  onClick={() => toggleSection(sectionIndex)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-hover transition-colors text-left"
                >
                  {expandedSections.has(sectionIndex) ? (
                    <ChevronDown className="w-5 h-5 text-muted flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted">
                        Section {sectionIndex + 1}
                      </span>
                      <span className="text-xs text-muted">
                        ({section.lessons?.length ?? 0} lessons)
                      </span>
                    </div>
                    <h3 className="font-semibold text-primary truncate">
                      {section.title || `Section ${sectionIndex + 1}`}
                    </h3>
                  </div>
                </button>

                {expandedSections.has(sectionIndex) && section.lessons && (
                  <div className="px-4 pb-3">
                    <div className="ml-8 space-y-2">
                      {section.lessons.map((lesson, lessonIndex) => (
                        <div
                          key={lessonIndex}
                          className="flex items-start gap-3 p-2 rounded hover:bg-hover"
                        >
                          <BookOpen className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-primary">
                              {lesson.title || `Lesson ${lessonIndex + 1}`}
                            </p>
                            {lesson.description && (
                              <p className="text-xs text-secondary line-clamp-2">
                                {lesson.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
            <p className="text-sm text-green-800">
              <strong>Ready to create your course?</strong> Click &quot;Create Course&quot; to approve
              this outline and start generating lesson content. This process runs in the background
              and you&apos;ll be notified when complete.
            </p>
          </div>
        </div>

        <WizardNavigation
          onBack={onBack}
          onNext={onApprove}
          onCancel={onCancel}
          canGoBack={true}
          canGoNext={true}
          isLoading={isLoading}
          nextLabel="Create Course"
        />
      </CardContent>
    </Card>
  );
}
