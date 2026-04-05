import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  completedTours: string[];
  dontShowAgain: boolean;

  completeTour: (tourId: string) => void;
  setDontShowAgain: (value: boolean) => void;
  hasTourCompleted: (tourId: string) => boolean;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedTours: [],
      dontShowAgain: false,

      completeTour: (tourId) =>
        set((state) => ({
          completedTours: state.completedTours.includes(tourId)
            ? state.completedTours
            : [...state.completedTours, tourId],
        })),

      setDontShowAgain: (value) => set({ dontShowAgain: value }),

      hasTourCompleted: (tourId) => get().completedTours.includes(tourId),

      reset: () => set({ completedTours: [], dontShowAgain: false }),
    }),
    { name: 'mirai-onboarding' }
  )
);
