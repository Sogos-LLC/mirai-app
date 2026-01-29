'use client';

interface ProgressBarProps {
  percent: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProgressBar({
  percent,
  showLabel = false,
  size = 'md',
  className = '',
}: ProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  const heights = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`flex-1 bg-surface-elevated rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className="h-full bg-primary-600 transition-all duration-500 ease-out"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-sm font-medium text-muted min-w-[3rem] text-right">
          {Math.round(clampedPercent)}%
        </span>
      )}
    </div>
  );
}
