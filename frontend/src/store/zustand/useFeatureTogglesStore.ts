import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const defaultToggles = {
  showTemplates: false,
  showTutorials: false,
  showTeams: false,
  showSourceGrounding: false,
  showAttributions: false,
  showMultiplePersonas: false,
  showKnowledgeSelection: false,
  showWebResearch: false,
  showStrictKnowledge: false,
  showQAChecks: false,
  showToneSelection: false,
  showWizardTutorial: true,
  showDashboardTour: true,
} as const;

export type FeatureToggleKey = keyof typeof defaultToggles;

interface FeatureTogglesState {
  showTemplates: boolean;
  showTutorials: boolean;
  showTeams: boolean;
  showSourceGrounding: boolean;
  showAttributions: boolean;
  showMultiplePersonas: boolean;
  showKnowledgeSelection: boolean;
  showWebResearch: boolean;
  showStrictKnowledge: boolean;
  showQAChecks: boolean;
  showToneSelection: boolean;
  showWizardTutorial: boolean;
  showDashboardTour: boolean;

  setToggle: (key: FeatureToggleKey, value: boolean) => void;
  resetAll: () => void;
}

export const useFeatureTogglesStore = create<FeatureTogglesState>()(
  persist(
    (set) => ({
      ...defaultToggles,
      setToggle: (key, value) => set({ [key]: value }),
      resetAll: () => set(defaultToggles),
    }),
    { name: 'mirai-feature-toggles' }
  )
);
