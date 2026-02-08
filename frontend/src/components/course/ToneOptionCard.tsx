import { ToneDetailLevel } from '@/gen/mirai/v1/course_wizard_pb';

interface ToneOptionCardProps {
  id: string;
  name: string;
  description: string;
  levelOfDetail: ToneDetailLevel;
  selected: boolean;
  onSelect: (id: string) => void;
}

const DETAIL_LABELS: Record<number, { label: string; color: string }> = {
  [ToneDetailLevel.BRIEF]: { label: 'Brief', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  [ToneDetailLevel.MODERATE]: { label: 'Moderate', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  [ToneDetailLevel.COMPREHENSIVE]: { label: 'Comprehensive', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

export function ToneOptionCard({
  id,
  name,
  description,
  levelOfDetail,
  selected,
  onSelect,
}: ToneOptionCardProps) {
  const detail = DETAIL_LABELS[levelOfDetail] ?? DETAIL_LABELS[ToneDetailLevel.MODERATE];

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`w-full text-left rounded-lg border p-4 transition-all min-h-[44px] ${
        selected
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500'
          : 'bg-surface hover:bg-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-primary">{name}</h4>
            <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${detail.color}`}>
              {detail.label}
            </span>
          </div>
          <p className="text-xs text-secondary">{description}</p>
        </div>
        <div
          className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            selected
              ? 'border-indigo-500 bg-indigo-500'
              : 'border-muted'
          }`}
        >
          {selected && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}
        </div>
      </div>
    </button>
  );
}
