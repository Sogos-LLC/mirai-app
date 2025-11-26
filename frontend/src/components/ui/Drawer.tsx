'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Side the drawer opens from */
  side?: 'left' | 'right';
  /** Width of the drawer */
  width?: string;
  /** Show close button */
  showCloseButton?: boolean;
  /** Title for the drawer header */
  title?: string;
}

export function Drawer({
  isOpen,
  onClose,
  children,
  side = 'left',
  width = '280px',
  showCloseButton = false,
  title,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number>(0);
  const currentX = useRef<number>(0);

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
    startX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!drawerRef.current) return;

      currentX.current = e.touches[0].clientX;
      const deltaX = currentX.current - startX.current;

      // Left drawer: allow swiping left (negative deltaX)
      // Right drawer: allow swiping right (positive deltaX)
      if (side === 'left' && deltaX < 0) {
        drawerRef.current.style.transform = `translateX(${deltaX}px)`;
      } else if (side === 'right' && deltaX > 0) {
        drawerRef.current.style.transform = `translateX(${deltaX}px)`;
      }
    },
    [side]
  );

  const handleTouchEnd = useCallback(() => {
    if (!drawerRef.current) return;

    const deltaX = currentX.current - startX.current;
    const threshold = 80;

    // Close if swiped far enough
    if (
      (side === 'left' && deltaX < -threshold) ||
      (side === 'right' && deltaX > threshold)
    ) {
      onClose();
    }

    // Reset position
    drawerRef.current.style.transform = '';
    startX.current = 0;
    currentX.current = 0;
  }, [side, onClose]);

  if (!isOpen) return null;

  const positionClasses = {
    left: 'left-0 rounded-r-2xl animate-slide-in-left',
    right: 'right-0 rounded-l-2xl',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'drawer-title' : undefined}
        className={`
          fixed top-0 bottom-0 z-50
          bg-white shadow-2xl
          flex flex-col
          safe-area-inset
          ${positionClasses[side]}
        `}
        style={{ width }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header (if title or close button) */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
            {title && (
              <h2
                id="drawer-title"
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
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}

export default Drawer;
