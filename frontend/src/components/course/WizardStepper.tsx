import { Fragment } from 'react';
import {
  CheckCircle,
  Sparkles,
  Target,
  Users,
  FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface WizardStepperProps {
  /** Current active phase (1-4). Values > 4 mark all phases as completed. */
  currentPhase: number;
}

interface PhaseDefinition {
  label: string;
  icon: LucideIcon;
}

const PHASES: PhaseDefinition[] = [
  { label: 'Topic', icon: Sparkles },
  { label: 'Outcomes', icon: Target },
  { label: 'Teacher & Student', icon: Users },
  { label: 'Context', icon: FileText },
];

export function WizardStepper({ currentPhase }: WizardStepperProps) {
  return (
    <div className="mb-8">
      {/* Desktop view — horizontal steps */}
      <nav aria-label="Wizard progress" className="hidden sm:flex items-start w-full">
        {PHASES.map((phase, i) => {
          const stepNumber = i + 1;
          const isActive = stepNumber === currentPhase;
          const isCompleted = stepNumber < currentPhase;
          const isFuture = !isActive && !isCompleted;
          const Icon = isCompleted ? CheckCircle : phase.icon;
          const isConnectorDone = stepNumber <= currentPhase;

          return (
            <Fragment key={stepNumber}>
              {/* Connector line */}
              {i > 0 && (
                <div
                  className={`
                    flex-1 h-0.5 mt-5 mx-2
                    ${isConnectorDone ? 'bg-indigo-600' : 'border-t-2 border-dashed'}
                  `}
                  style={
                    !isConnectorDone
                      ? { borderColor: 'var(--border-default)' }
                      : undefined
                  }
                />
              )}

              {/* Step circle + label */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`
                    flex items-center justify-center w-10 h-10 rounded-full transition-colors
                    ${isCompleted
                      ? 'bg-indigo-600 text-white'
                      : isActive
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-600'
                        : ''
                    }
                  `}
                  style={
                    isFuture
                      ? { border: '2px solid var(--border-default)', color: 'var(--text-muted)' }
                      : undefined
                  }
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-medium mt-2 whitespace-nowrap ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : isCompleted
                        ? 'text-primary'
                        : 'text-muted'
                  }`}
                >
                  {phase.label}
                </span>
              </div>
            </Fragment>
          );
        })}
      </nav>

      {/* Mobile view — compact progress bar */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-primary">
            Step {currentPhase} of {PHASES.length}
          </span>
          <span className="text-sm text-secondary">
            {PHASES[currentPhase - 1]?.label}
          </span>
        </div>
        <div className="w-full bg-page rounded-full h-2 border overflow-hidden">
          <div
            className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentPhase / PHASES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
