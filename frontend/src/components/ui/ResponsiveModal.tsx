'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from './BottomSheet';

export interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Size for desktop modal */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Height for mobile bottom sheet */
  mobileHeight?: 'auto' | 'half' | 'full';
  /** Footer content (buttons, etc.) */
  footer?: React.ReactNode;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function ResponsiveModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  mobileHeight = 'auto',
  footer,
}: ResponsiveModalProps) {
  const isMobile = useIsMobile();

  // Handle escape key (for desktop)
  useEffect(() => {
    if (!isMobile) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose, isMobile]);

  // Lock body scroll when open (for desktop)
  useEffect(() => {
    if (!isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
    } else if (!isMobile) {
      document.body.style.overflow = '';
    }

    return () => {
      if (!isMobile) {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen, isMobile]);

  if (!isOpen) return null;

  // Mobile: Render as BottomSheet
  if (isMobile) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        height={mobileHeight}
        showDragHandle={true}
        showCloseButton={true}
      >
        <div className="flex flex-col h-full">
          <div className="flex-1">{children}</div>
          {footer && (
            <div className="pt-4 mt-auto border-t border-gray-100 -mx-4 px-4 pb-2">
              {footer}
            </div>
          )}
        </div>
      </BottomSheet>
    );
  }

  // Desktop: Render as centered modal
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className={`
            bg-white rounded-2xl shadow-xl
            w-full ${sizeClasses[size]}
            max-h-[90vh] overflow-hidden
            flex flex-col
            animate-fadeIn
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2
              id="modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ResponsiveModal;
