'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { pickMessage, funFacts } from './loadingMessages';

interface FunLoadingOverlayProps {
  title: string;
  messages: string[];
  /** Progress 0-100, if available */
  progress?: number;
}

export function FunLoadingOverlay({ title, messages, progress }: FunLoadingOverlayProps) {
  const [currentMessage, setCurrentMessage] = useState(messages[0] ?? 'Working...');
  const [funFact, setFunFact] = useState('');
  const lastMsgIdx = useRef(-1);
  const lastFactIdx = useRef(-1);

  // Rotate main message every 4s
  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => {
      const { message, index } = pickMessage(messages, lastMsgIdx.current);
      lastMsgIdx.current = index;
      setCurrentMessage(message);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages]);

  // Show a fun fact after 8s, rotate every 10s
  useEffect(() => {
    const showTimer = setTimeout(() => {
      const { message, index } = pickMessage(funFacts, lastFactIdx.current);
      lastFactIdx.current = index;
      setFunFact(message);
    }, 8000);

    const rotateInterval = setInterval(() => {
      const { message, index } = pickMessage(funFacts, lastFactIdx.current);
      lastFactIdx.current = index;
      setFunFact(message);
    }, 18000);

    return () => {
      clearTimeout(showTimer);
      clearInterval(rotateInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Breathing animation */}
      <div className="relative w-24 h-24 mx-auto mb-8">
        <div className="absolute inset-0 bg-indigo-100 dark:bg-indigo-900/30 rounded-full animate-[pulse_3s_ease-in-out_infinite]" />
        <div className="absolute inset-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full animate-[pulse_3s_ease-in-out_infinite_0.5s]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg sm:text-xl font-bold text-primary mb-3">{title}</h3>

      {/* Rotating message */}
      <p className="text-sm sm:text-base text-secondary max-w-md mb-6 transition-opacity duration-500">
        {currentMessage}
      </p>

      {/* Progress bar */}
      {progress !== undefined && (
        <div className="w-full max-w-xs mb-6">
          <div className="w-full h-2 bg-page rounded-full border overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
          <span className="text-xs text-muted mt-1 inline-block">{progress}%</span>
        </div>
      )}

      {/* Bouncing dots */}
      <div className="flex justify-center gap-2 mb-8">
        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      {/* Fun fact */}
      {funFact && (
        <div className="max-w-sm mx-auto px-4 py-3 bg-surface border rounded-lg">
          <p className="text-xs text-muted italic">{funFact}</p>
        </div>
      )}
    </div>
  );
}
