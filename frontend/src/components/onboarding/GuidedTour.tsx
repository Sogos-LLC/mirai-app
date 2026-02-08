'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboardingStore } from '@/store/zustand/useOnboardingStore';

interface GuidedTourProps {
  tourId: string;
  steps: DriveStep[];
  /** When true, the tour shows every visit unless user checks "Don't show again". */
  persistent?: boolean;
}

const DISMISS_CHECKBOX_ID = 'mirai-tour-dismiss';

export function GuidedTour({ tourId, steps, persistent }: GuidedTourProps) {
  const hasRun = useRef(false);
  const { completedTours, dontShowAgain, completeTour } = useOnboardingStore();

  useEffect(() => {
    if (hasRun.current) return;
    if (dontShowAgain) return;
    // Non-persistent tours skip if already completed
    if (!persistent && completedTours.includes(tourId)) return;
    // Persistent tours skip only if explicitly dismissed
    if (persistent && completedTours.includes(tourId)) return;

    hasRun.current = true;

    // Small delay to let the page render first
    const timer = setTimeout(() => {
      const isLastStep = (idx: number) => idx === steps.length - 1;

      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: 'rgba(0, 0, 0, 0.6)',
        stagePadding: 8,
        stageRadius: 8,
        popoverClass: 'mirai-tour-popover',
        steps,
        onPopoverRender: (popover, { state }) => {
          if (!persistent) return;
          if (!isLastStep(state.activeIndex ?? 0)) return;

          // Add "Don't show again" checkbox to the last step footer
          const checkboxRow = document.createElement('label');
          checkboxRow.style.cssText =
            'display:flex;align-items:center;gap:6px;margin-top:12px;font-size:13px;color:var(--text-secondary,#6b7280);cursor:pointer;user-select:none;';
          checkboxRow.innerHTML = `<input type="checkbox" id="${DISMISS_CHECKBOX_ID}" style="accent-color:#6366f1;width:15px;height:15px;cursor:pointer;" /> Don&apos;t show this again`;
          popover.description.appendChild(checkboxRow);
        },
        onDestroyed: () => {
          if (persistent) {
            const cb = document.getElementById(DISMISS_CHECKBOX_ID) as HTMLInputElement | null;
            if (cb?.checked) {
              completeTour(tourId);
            }
            // If not checked, don't mark as completed — it will show again next visit
          } else {
            completeTour(tourId);
          }
        },
      });

      driverObj.drive();
    }, 800);

    return () => clearTimeout(timer);
  }, [tourId, steps, completedTours, dontShowAgain, completeTour, persistent]);

  return null;
}
