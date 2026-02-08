'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Adds target="_blank" and rel="noopener noreferrer" to all anchor tags
 * within the referenced element. Re-runs when `dep` changes.
 */
export function useExternalLinks(ref: RefObject<HTMLElement | null>, dep: string) {
  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll('a[href]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [dep]);
}
