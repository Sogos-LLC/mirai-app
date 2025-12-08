'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Mail, X } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function CheckoutSuccessModal() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout');
    if (checkoutStatus === 'success') {
      setIsOpen(true);
      // Trigger confetti celebration
      triggerConfetti();
    }
  }, [searchParams]);

  const triggerConfetti = () => {
    // Multiple bursts for a more exciting effect
    const defaults = {
      spread: 360,
      ticks: 100,
      gravity: 0.5,
      decay: 0.94,
      startVelocity: 30,
      colors: ['#4f46e5', '#7c3aed', '#06b6d4', '#10b981', '#f59e0b'],
    };

    // Center burst
    confetti({
      ...defaults,
      particleCount: 100,
      origin: { x: 0.5, y: 0.5 },
    });

    // Side bursts with delay
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 50,
        origin: { x: 0.25, y: 0.6 },
      });
    }, 150);

    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 50,
        origin: { x: 0.75, y: 0.6 },
      });
    }, 300);
  };

  const handleClose = () => {
    setIsOpen(false);
    // Remove the query param from URL without refresh
    const newUrl = window.location.pathname;
    router.replace(newUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-surface rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in fade-in zoom-in duration-300">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted hover:text-secondary transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Success icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-4">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
        </div>

        {/* Content */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-primary mb-3">
            Payment Successful!
          </h2>
          <p className="text-secondary mb-6">
            Thank you for subscribing to Mirai! Your account is being set up
            right now.
          </p>

          {/* Email notification info */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-indigo-700 dark:text-indigo-300 mb-2">
              <Mail className="h-5 w-5" />
              <span className="font-medium">Check Your Email</span>
            </div>
            <p className="text-sm text-indigo-600 dark:text-indigo-400">
              You&apos;ll receive a welcome email shortly with your login
              credentials and next steps.
            </p>
          </div>

          {/* What happens next */}
          <div className="text-left bg-surface-elevated rounded-xl p-4 mb-6">
            <h3 className="font-medium text-primary mb-2">What happens next?</h3>
            <ul className="space-y-2 text-sm text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">1.</span>
                Your account is being provisioned (usually under a minute)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">2.</span>
                You&apos;ll receive a welcome email with login instructions
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">3.</span>
                Log in and start creating amazing courses!
              </li>
            </ul>
          </div>

          <button
            onClick={handleClose}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
