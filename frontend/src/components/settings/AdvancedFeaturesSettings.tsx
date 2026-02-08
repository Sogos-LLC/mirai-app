'use client';

import { useFeatureTogglesStore, type FeatureToggleKey } from '@/store/zustand/useFeatureTogglesStore';
import { ToggleLeft, ToggleRight } from 'lucide-react';

interface ToggleItem {
  key: FeatureToggleKey;
  label: string;
  description: string;
}

const TOGGLE_ITEMS: ToggleItem[] = [
  {
    key: 'showSourceGrounding',
    label: 'Source Grounding',
    description: 'Show content attribution and provenance tracking in the editor.',
  },
  {
    key: 'showAttributions',
    label: 'Source Attributions',
    description: 'Display inline source references and citation badges on course content.',
  },
  {
    key: 'showMultiplePersonas',
    label: 'Multiple Personas',
    description: 'Allow selecting multiple teacher and student personas during course creation.',
  },
  {
    key: 'showKnowledgeSelection',
    label: 'Knowledge Selection',
    description: 'Show the knowledge document picker in the course creation wizard.',
  },
  {
    key: 'showWebResearch',
    label: 'Web Research',
    description: 'Enable AI web search to enrich course content with real-time information.',
  },
  {
    key: 'showStrictKnowledge',
    label: 'Strict Knowledge Mode',
    description: 'Restrict AI generation to only use your uploaded knowledge documents.',
  },
  {
    key: 'showQAChecks',
    label: 'Quality Assurance Checks',
    description: 'Run automated quality checks on generated course content before export.',
  },
  {
    key: 'showToneSelection',
    label: 'Tone Selection',
    description: 'Choose the writing tone and style for AI-generated content.',
  },
  {
    key: 'showTemplates',
    label: 'Course Templates',
    description: 'Browse and use pre-built course templates as starting points.',
  },
  {
    key: 'showWizardTutorial',
    label: 'Wizard Tutorial',
    description: 'Show the step-by-step guided tour each time you create a new course.',
  },
  {
    key: 'showTutorials',
    label: 'Tutorials',
    description: 'Show built-in tutorials and help guides in the interface.',
  },
  {
    key: 'showTeams',
    label: 'Team Features',
    description: 'Enable team collaboration, shared folders, and member management.',
  },
];

export default function AdvancedFeaturesSettings() {
  const store = useFeatureTogglesStore();

  return (
    <div>
      <h2 className="text-xl lg:text-2xl font-bold text-primary mb-2">
        Advanced Features
      </h2>
      <p className="text-sm text-secondary mb-6">
        Toggle advanced features on or off. These are hidden by default to keep
        the interface simple. Enable them as you need them.
      </p>

      <div className="space-y-1">
        {TOGGLE_ITEMS.map((item) => {
          const isOn = store[item.key];
          return (
            <div
              key={item.key}
              className="flex items-center justify-between py-4 border-b last:border-0"
            >
              <div className="flex-1 min-w-0 pr-4">
                <p className="font-medium text-primary">{item.label}</p>
                <p className="text-sm text-secondary">{item.description}</p>
              </div>
              <button
                onClick={() => store.setToggle(item.key, !isOn)}
                className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label={`Toggle ${item.label}`}
              >
                {isOn ? (
                  <ToggleRight className="w-10 h-6 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <ToggleLeft className="w-10 h-6 text-muted" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t">
        <button
          onClick={store.resetAll}
          className="text-sm text-secondary hover:text-primary transition-colors"
        >
          Reset all to defaults
        </button>
      </div>
    </div>
  );
}
