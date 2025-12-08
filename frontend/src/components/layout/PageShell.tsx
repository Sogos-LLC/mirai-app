'use client';

import React from 'react';

interface PageShellProps {
  children: React.ReactNode;
  /** Page title displayed in header */
  title?: string;
  /** Optional subtitle/description */
  description?: string;
  /** Action buttons (Edit, Delete, etc.) - rendered on right side of header */
  actions?: React.ReactNode;
  /** Optional back button configuration */
  backButton?: {
    label: string;
    onClick: () => void;
  };
  /** Additional className for the container */
  className?: string;
  /** Max width preset - defaults to '4xl' */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
}

const maxWidthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

/**
 * PageShell - A responsive page wrapper with header section.
 *
 * Mobile-first design:
 * - Header stacks vertically on mobile (title above, actions below)
 * - Header is horizontal on desktop (title left, actions right)
 * - Uses semantic tokens for colors
 *
 * Usage:
 * ```tsx
 * <PageShell
 *   title="Team Settings"
 *   description="Manage your team"
 *   actions={<Button>Edit</Button>}
 *   backButton={{ label: "Back to Teams", onClick: () => router.push('/teams') }}
 * >
 *   {content}
 * </PageShell>
 * ```
 */
export function PageShell({
  children,
  title,
  description,
  actions,
  backButton,
  className = '',
  maxWidth = '4xl',
}: PageShellProps) {
  const hasHeader = title || description || actions;

  return (
    <div className={`${maxWidthClasses[maxWidth]} mx-auto ${className}`}>
      {/* Back Button */}
      {backButton && (
        <button
          onClick={backButton.onClick}
          className="flex items-center text-sm text-secondary hover:text-primary mb-4 md:mb-6 transition-colors"
        >
          <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {backButton.label}
        </button>
      )}

      {/* Page Header */}
      {hasHeader && (
        <div className="mb-6 md:mb-8">
          {/* Mobile: Stack vertically, Desktop: Row with space-between */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {/* Title & Description */}
            {(title || description) && (
              <div className="min-w-0 flex-1">
                {title && (
                  <h1 className="text-2xl md:text-3xl font-bold text-primary truncate">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className="mt-1 text-sm md:text-base text-secondary">
                    {description}
                  </p>
                )}
              </div>
            )}

            {/* Actions - full width on mobile, auto on desktop */}
            {actions && (
              <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:flex-shrink-0">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page Content */}
      {children}
    </div>
  );
}

export default PageShell;
