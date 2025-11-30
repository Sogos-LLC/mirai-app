'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';

const LOADING_MESSAGES = [
  'Getting things ready...',
  'Setting up your workspace...',
  'Preparing your learning environment...',
  'Almost there...',
  'Loading your courses...',
  'Brewing some knowledge...',
  'Connecting the dots...',
  'Warming up the engines...',
];

interface LoadingScreenProps {
  /** Custom message to display (overrides rotating messages) */
  message?: string;
  /** Whether to rotate through messages */
  rotateMessages?: boolean;
  /** Interval for message rotation in ms */
  rotationInterval?: number;
}

/**
 * Full-page loading screen with friendly messages.
 * Works great with RTK Query isLoading states or auth initialization.
 *
 * @example
 * // With RTK Query
 * const { isLoading } = useGetCoursesQuery();
 * if (isLoading) return <LoadingScreen />;
 *
 * @example
 * // With auth initialization
 * const isInitialized = useSelector(selectIsAuthInitialized);
 * if (!isInitialized) return <LoadingScreen message="Signing you in..." />;
 */
export default function LoadingScreen({
  message,
  rotateMessages = true,
  rotationInterval = 3000,
}: LoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    if (message || !rotateMessages) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      setFadeKey((prev) => prev + 1);
    }, rotationInterval);

    return () => clearInterval(interval);
  }, [message, rotateMessages, rotationInterval]);

  const displayMessage = message || LOADING_MESSAGES[messageIndex];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* Logo with pulse animation */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-indigo-400 rounded-2xl blur-xl opacity-20 animate-pulse" />
        <div className="relative bg-white rounded-2xl p-6 shadow-lg">
          <BookOpen className="w-12 h-12 text-indigo-600" />
        </div>
      </div>

      {/* Loading spinner */}
      <div className="mb-6">
        <div className="w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>

      {/* Message with fade transition */}
      <p
        key={fadeKey}
        className="text-lg text-slate-600 font-medium transition-opacity duration-500"
        style={{
          animation: 'fadeIn 0.5s ease-in-out',
        }}
      >
        {displayMessage}
      </p>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
