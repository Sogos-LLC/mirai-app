'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** Height of the sheet: 'auto', 'half', or 'full' */
  height?: 'auto' | 'half' | 'full';
  /** Show the drag handle indicator */
  showDragHandle?: boolean;
  /** Show close button in header */
  showCloseButton?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  height = 'auto',
  showDragHandle = true,
  showCloseButton = true,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Touch handlers for swipe-to-dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!sheetRef.current) return;

    currentY.current = e.touches[0].clientY;
    const deltaY = currentY.current - startY.current;

    // Only allow dragging down
    if (deltaY > 0) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!sheetRef.current) return;

    const deltaY = currentY.current - startY.current;

    // If dragged more than 100px down, close the sheet
    if (deltaY > 100) {
      onClose();
    }

    // Reset position
    sheetRef.current.style.transform = '';
    startY.current = 0;
    currentY.current = 0;
  }, [onClose]);

  // Calculate height class
  const heightClass = {
    auto: 'max-h-[85vh]',
    half: 'h-[50vh]',
    full: 'h-[calc(100vh-var(--safe-area-top)-24px)]',
  }[height];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
        className={`
          fixed bottom-0 left-0 right-0 z-50
          bg-white rounded-t-2xl shadow-2xl
          flex flex-col
          animate-slide-in-bottom
          safe-area-bottom
          ${heightClass}
        `}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        {showDragHandle && (
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
        )}

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            {title && (
              <h2
                id="bottom-sheet-title"
                className="text-lg font-semibold text-gray-900"
              >
                {title}
              </h2>
            )}
            {!title && <div />}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full touch-target flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
      </div>
    </>
  );
}

export default BottomSheet;
