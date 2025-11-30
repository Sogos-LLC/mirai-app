'use client';

import { useState, useEffect } from 'react';

export default function BuildInfo() {
  const [mounted, setMounted] = useState(false);
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!buildTime || !mounted) return null;

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString.slice(0, 16);
    }
  };

  return (
    <div className="fixed bottom-2 right-2 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded shadow-sm z-50">
      Built: {formatDate(buildTime)}
    </div>
  );
}
