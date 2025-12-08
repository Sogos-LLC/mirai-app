import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Whether to include padding inside the card */
  padded?: boolean;
}

/**
 * Card component using semantic design tokens.
 * Automatically adapts to light/dark mode via CSS variables.
 *
 * Uses:
 * - bg-surface: Card background (white in light, dark surface in dark)
 * - border: Default border color (gray-200 in light, purple-tinted in dark)
 */
export function Card({ children, className = '', padded = false }: CardProps) {
  return (
    <div
      className={`bg-surface border rounded-lg shadow-sm ${padded ? 'p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card header with bottom border separator
 */
export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-4 py-5 sm:px-6 border-b ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card content area
 */
export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={`px-4 py-5 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

/**
 * Card title using semantic text color
 */
export function CardTitle({ children, className = '', as: Component = 'h2' }: CardTitleProps) {
  const sizeClasses = {
    h1: 'text-2xl',
    h2: 'text-lg',
    h3: 'text-base',
    h4: 'text-sm',
  };

  return (
    <Component className={`font-medium text-primary ${sizeClasses[Component]} ${className}`}>
      {children}
    </Component>
  );
}

interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card description using secondary text color
 */
export function CardDescription({ children, className = '' }: CardDescriptionProps) {
  return (
    <p className={`mt-1 text-sm text-secondary ${className}`}>
      {children}
    </p>
  );
}

export default Card;
