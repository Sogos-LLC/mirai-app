'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboardingStore } from '@/store/zustand/useOnboardingStore';

interface GuidedTourProps {
  tourId: string;
  steps: DriveStep[];
}

export function GuidedTour({ tourId, steps }: GuidedTourProps) {
  const hasRun = useRef(false);
  const { completedTours, dontShowAgain, completeTour } = useOnboardingStore();

  useEffect(() => {
    if (hasRun.current) return;
    if (dontShowAgain) return;
    if (completedTours.includes(tourId)) return;

    hasRun.current = true;

    // Small delay to let the page render first
    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: 'rgba(0, 0, 0, 0.6)',
        stagePadding: 8,
        stageRadius: 8,
        popoverClass: 'mirai-tour-popover',
        steps,
        onDestroyed: () => {
          completeTour(tourId);
        },
      });

      driverObj.drive();
    }, 800);

    return () => clearTimeout(timer);
  }, [tourId, steps, completedTours, dontShowAgain, completeTour]);

  return null;
}
