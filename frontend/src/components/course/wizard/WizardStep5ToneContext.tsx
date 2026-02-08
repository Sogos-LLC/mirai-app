import { useState } from 'react';
import { MessageCircle, RefreshCw, Eye, X } from 'lucide-react';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import type { ToneOption } from '@/gen/mirai/v1/course_wizard_pb';
import { ToneOptionCard } from '@/components/course/ToneOptionCard';
import { ToneDetailLevel } from '@/gen/mirai/v1/course_wizard_pb';
import Button from '@/components/ui/Button';

const detailLevelLabels: Record<number, string> = {
  [ToneDetailLevel.BRIEF]: 'Brief',
  [ToneDetailLevel.MODERATE]: 'Moderate',
  [ToneDetailLevel.COMPREHENSIVE]: 'Comprehensive',
};

const detailLevelDescriptions: Record<number, string> = {
  [ToneDetailLevel.BRIEF]: 'Quick, focused lessons for busy learners',
  [ToneDetailLevel.MODERATE]: 'Balanced depth with practical examples',
  [ToneDetailLevel.COMPREHENSIVE]: 'In-depth coverage with extensive details',
};

const detailLevelColors: Record<number, string> = {
  [ToneDetailLevel.BRIEF]: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  [ToneDetailLevel.MODERATE]: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  [ToneDetailLevel.COMPREHENSIVE]: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

interface WizardStep5ToneContextProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep5ToneContext({ context, send }: WizardStep5ToneContextProps) {
  const [viewingTone, setViewingTone] = useState<ToneOption | null>(null);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <MessageCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary">
              Choose Your Course Tone
            </h2>
            <p className="text-sm sm:text-base text-secondary">
              Select how you want your course content to sound and feel.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => send({ type: 'REGENERATE' })}
          className="self-start sm:self-auto gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate
        </Button>
      </div>

      {/* 3-column tone cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        {context.toneOptions.map((tone) => (
          <div key={tone.id} className="flex flex-col">
            <ToneOptionCard
              id={tone.id}
              name={tone.name}
              description={tone.description}
              levelOfDetail={tone.levelOfDetail}
              selected={context.selectedToneId === tone.id}
              onSelect={(id) => send({ type: 'SET_TONE', id })}
            />
            <button
              onClick={() => setViewingTone(tone)}
              className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline flex items-center gap-1 self-start px-1"
            >
              <Eye className="w-3 h-3" />
              View full details
            </button>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted text-center mb-8">
        The tone you select will influence the writing style, complexity, and detail level of your course content.
      </p>

      {/* Additional Context */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-primary mb-2">
          Additional Context
          <span className="text-muted font-normal text-sm ml-1">(optional)</span>
        </h3>
        <p className="text-sm text-secondary mb-4">
          Add any extra details to help guide the course outline.
        </p>
        <textarea
          id="additionalContext"
          value={context.additionalContext}
          onChange={(e) => send({ type: 'SET_ADDITIONAL_CONTEXT', value: e.target.value })}
          placeholder={"Examples:\n\u2022 Focus more on practical examples than theory\n\u2022 Include a section on common mistakes to avoid\n\u2022 The course should be completable in under 2 hours\n\u2022 Prerequisite: Basic understanding of Python"}
          rows={5}
          className="w-full px-4 py-3 bg-page border rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
        <p className="text-sm text-muted mt-2">
          This information will be used to customize your course outline.
        </p>
      </div>

      {/* Tone Detail Modal */}
      {viewingTone && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingTone(null)}
        >
          <div
            className="bg-surface rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold text-primary">{viewingTone.name}</h3>
                <button
                  onClick={() => setViewingTone(null)}
                  className="p-2 rounded hover:bg-hover min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-2"
                >
                  <X className="w-5 h-5 text-muted" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted mb-1">Description</p>
                  <p className="text-secondary">{viewingTone.description}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted mb-1">Detail Level</p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${detailLevelColors[viewingTone.levelOfDetail] ?? ''}`}>
                      {detailLevelLabels[viewingTone.levelOfDetail] ?? 'Unknown'}
                    </span>
                    <span className="text-sm text-secondary">
                      {detailLevelDescriptions[viewingTone.levelOfDetail] ?? ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setViewingTone(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    send({ type: 'SET_TONE', id: viewingTone.id });
                    setViewingTone(null);
                  }}
                >
                  Select This Tone
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
