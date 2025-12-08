import React from 'react';

interface AdaptiveGridProps {
  children: React.ReactNode;
  /** Additional className */
  className?: string;
  /**
   * Column configuration per breakpoint.
   * Defaults: 1 column on mobile, 2 at md, 3 at lg
   */
  cols?: {
    default?: 1 | 2 | 3 | 4;
    sm?: 1 | 2 | 3 | 4;
    md?: 1 | 2 | 3 | 4;
    lg?: 1 | 2 | 3 | 4;
    xl?: 1 | 2 | 3 | 4 | 5 | 6;
  };
  /** Gap size between items */
  gap?: 'none' | 'sm' | 'md' | 'lg';
}

const colClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const gapClasses: Record<string, string> = {
  none: 'gap-0',
  sm: 'gap-3 md:gap-4',
  md: 'gap-4 md:gap-6',
  lg: 'gap-6 md:gap-8',
};

/**
 * AdaptiveGrid - A responsive CSS Grid container.
 *
 * Mobile-first: Starts with 1 column, expands at breakpoints.
 *
 * Usage:
 * ```tsx
 * // Default: 1 col -> 2 col (md) -> 3 col (lg)
 * <AdaptiveGrid>
 *   <Card>Item 1</Card>
 *   <Card>Item 2</Card>
 *   <Card>Item 3</Card>
 * </AdaptiveGrid>
 *
 * // Custom: 1 col -> 2 col (sm) -> 3 col (md) -> 4 col (xl)
 * <AdaptiveGrid cols={{ default: 1, sm: 2, md: 3, xl: 4 }} gap="lg">
 *   {items.map(item => <Card key={item.id}>{item.name}</Card>)}
 * </AdaptiveGrid>
 * ```
 */
export function AdaptiveGrid({
  children,
  className = '',
  cols = {},
  gap = 'md',
}: AdaptiveGridProps) {
  // Build responsive column classes
  const {
    default: defaultCols = 1,
    sm: smCols,
    md: mdCols = 2,
    lg: lgCols = 3,
    xl: xlCols,
  } = cols;

  const columnClasses = [
    colClasses[defaultCols],
    smCols && `sm:${colClasses[smCols]}`,
    `md:${colClasses[mdCols]}`,
    `lg:${colClasses[lgCols]}`,
    xlCols && `xl:${colClasses[xlCols]}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`grid ${columnClasses} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
}

export default AdaptiveGrid;
