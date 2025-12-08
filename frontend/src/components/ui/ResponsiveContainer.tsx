import React from 'react';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Max-width preset */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
  /** Center the container horizontally (default: true) */
  centered?: boolean;
  /** Add horizontal padding (default: true) */
  padded?: boolean;
  /** HTML element to render as */
  as?: 'div' | 'section' | 'article' | 'main';
}

const sizeClasses: Record<string, string> = {
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
 * ResponsiveContainer - A max-width container with safe-area support.
 *
 * Features:
 * - Configurable max-width
 * - Optional centering
 * - Responsive horizontal padding
 * - Safe-area inset support for mobile devices
 *
 * Usage:
 * ```tsx
 * <ResponsiveContainer size="4xl">
 *   <h1>Page Content</h1>
 * </ResponsiveContainer>
 *
 * <ResponsiveContainer size="2xl" centered={false} padded={false}>
 *   <FullWidthBanner />
 * </ResponsiveContainer>
 * ```
 */
export function ResponsiveContainer({
  children,
  className = '',
  size = '7xl',
  centered = true,
  padded = true,
  as: Component = 'div',
}: ResponsiveContainerProps) {
  const classes = [
    sizeClasses[size],
    centered && 'mx-auto',
    padded && 'px-4 sm:px-6 lg:px-8',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <Component className={classes}>{children}</Component>;
}

export default ResponsiveContainer;
