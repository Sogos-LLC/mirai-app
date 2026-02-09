'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureTogglesStore, type FeatureToggleKey } from '@/store/zustand/useFeatureTogglesStore';

interface FeatureGateProps {
  toggle: FeatureToggleKey;
  children: React.ReactNode;
}

/**
 * Gates access to a page behind a feature toggle.
 * If the toggle is disabled, redirects to /content-library.
 */
export function FeatureGate({ toggle, children }: FeatureGateProps) {
  const enabled = useFeatureTogglesStore((s) => s[toggle]);
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      router.replace('/content-library');
    }
  }, [enabled, router]);

  if (!enabled) return null;

  return <>{children}</>;
}
