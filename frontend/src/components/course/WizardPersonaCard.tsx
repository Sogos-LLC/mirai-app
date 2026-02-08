import { Check } from 'lucide-react';

interface WizardPersonaCardProps {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  selected: boolean;
  onToggle: (id: string) => void;
}

export function WizardPersonaCard({
  id,
  title,
  subtitle,
  description,
  tags,
  selected,
  onToggle,
}: WizardPersonaCardProps) {
  return (
    <div
      onClick={() => onToggle(id)}
      className={`
        p-4 rounded-lg border-2 cursor-pointer transition-all flex flex-col
        ${selected
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
          : 'border-transparent bg-surface hover:border-gray-300 dark:hover:border-gray-600'
        }
      `}
    >
      {/* Title + checkbox */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-primary leading-tight">{title}</h3>
        <div
          className={`
            shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
            ${selected
              ? 'bg-indigo-600 border-indigo-600'
              : 'border-gray-300 dark:border-gray-500'
            }
          `}
        >
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-secondary mb-2 line-clamp-2">{description}</p>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-surface-elevated border rounded-full text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Voice / role subtitle */}
      <p className="text-xs text-muted italic line-clamp-1 mt-auto">
        Voice: {subtitle}
      </p>
    </div>
  );
}
