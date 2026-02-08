import { Check } from 'lucide-react';
import { ToneDetailLevel } from '@/gen/mirai/v1/course_wizard_pb';

interface ToneOptionCardProps {
  id: string;
  name: string;
  description: string;
  levelOfDetail: ToneDetailLevel;
  selected: boolean;
  onSelect: (id: string) => void;
}

const DETAIL_LABELS: Record<number, { label: string; color: string; description: string }> = {
  [ToneDetailLevel.BRIEF]: {
    label: 'Brief',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    description: 'Quick, focused lessons for busy learners',
  },
  [ToneDetailLevel.MODERATE]: {
    label: 'Moderate',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    description: 'Balanced depth with practical examples',
  },
  [ToneDetailLevel.COMPREHENSIVE]: {
    label: 'Comprehensive',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    description: 'In-depth coverage with extensive details',
  },
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
    <div
      onClick={() => onSelect(id)}
      className={`
        p-5 rounded-lg border-2 cursor-pointer transition-all flex flex-col
        ${selected
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
          : 'border-transparent bg-surface hover:border-gray-300 dark:hover:border-gray-600'
        }
      `}
    >
      {/* Title + radio */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-primary text-lg line-clamp-1">{name}</h3>
        <div
          className={`
            shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
            ${selected
              ? 'bg-indigo-600 border-indigo-600'
              : 'border-gray-300 dark:border-gray-500'
            }
          `}
        >
          {selected && <Check className="w-4 h-4 text-white" />}
        </div>
      </div>

      {/* Description */}
      <div className="h-[72px] mb-3">
        <p className="text-sm text-secondary line-clamp-3">{description}</p>
      </div>

      {/* Detail level */}
      <div className="pt-3 border-t mt-auto">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Detail Level</span>
          <span className={`px-2 py-1 text-xs rounded-full font-medium ${detail.color}`}>
            {detail.label}
          </span>
        </div>
        <p className="text-xs text-muted mt-1">{detail.description}</p>
      </div>
    </div>
  );
}
