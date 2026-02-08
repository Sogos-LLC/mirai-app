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
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={`w-full text-left rounded-lg border p-4 transition-all min-h-[44px] ${
        selected
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500'
          : 'bg-surface hover:bg-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-primary truncate">{title}</h4>
            <span className="text-xs text-muted shrink-0">{subtitle}</span>
          </div>
          <p className="text-xs text-secondary line-clamp-2 mb-2">{description}</p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-elevated text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div
          className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            selected
              ? 'border-indigo-500 bg-indigo-500 text-white'
              : 'border-muted'
          }`}
        >
          {selected && <Check className="w-3 h-3" />}
        </div>
      </div>
    </button>
  );
}
