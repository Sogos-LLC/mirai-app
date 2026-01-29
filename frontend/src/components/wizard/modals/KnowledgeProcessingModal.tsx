'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

interface KnowledgeProcessingModalProps {
  isOpen: boolean;
  status: 'processing' | 'success';
  fileCount: number;
  onSuccessComplete?: () => void;
}

export function KnowledgeProcessingModal({
  isOpen,
  status,
  fileCount,
  onSuccessComplete,
}: KnowledgeProcessingModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  // Handle the success transition animation
  useEffect(() => {
    if (status === 'success') {
      setShowSuccess(true);
      // Auto-transition after 1 second
      const timer = setTimeout(() => {
        onSuccessComplete?.();
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setShowSuccess(false);
    }
  }, [status, onSuccessComplete]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40"
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          className="
            bg-white dark:bg-dark-surface-elevated
            rounded-2xl shadow-xl dark:shadow-dark-lg
            w-full max-w-sm
            p-8
            flex flex-col items-center justify-center
            animate-fadeIn
            dark:border dark:border-dark-border
          "
        >
          {/* Icon */}
          <div className={`
            w-20 h-20 rounded-full flex items-center justify-center mb-6
            transition-all duration-300
            ${showSuccess
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-primary-100 dark:bg-primary-900/30'
            }
          `}>
            {showSuccess ? (
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400 animate-scaleIn" />
            ) : (
              <Loader2 className="w-10 h-10 text-primary-600 dark:text-primary-400 animate-spin" />
            )}
          </div>

          {/* Text */}
          <h3 className="text-xl font-semibold text-primary mb-2 text-center">
            {showSuccess ? 'Processing Complete!' : 'Processing Knowledge Sources...'}
          </h3>

          {!showSuccess && (
            <p className="text-secondary text-center">
              Uploading and indexing {fileCount} {fileCount === 1 ? 'document' : 'documents'}
            </p>
          )}
        </div>
      </div>

      {/* Custom animation for checkmark */}
      <style jsx>{`
        @keyframes scaleIn {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scaleIn {
          animation: scaleIn 0.4s ease-out forwards;
        }
      `}</style>
    </>
  );
}

export default KnowledgeProcessingModal;
