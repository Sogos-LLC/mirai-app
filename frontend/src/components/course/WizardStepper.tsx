import { Fragment } from 'react';
import {
  Check,
  FileText,
  Sparkles,
  Users,
  Target,
  MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface WizardStepperProps {
  /** Current active phase (1-5). Values > 5 mark all phases as completed. */
  currentPhase: number;
}

interface PhaseDefinition {
  label: string;
  icon: LucideIcon;
}

const PHASES: PhaseDefinition[] = [
  { label: 'Course Setup', icon: FileText },
  { label: 'Learning Outcomes', icon: Target },
  { label: 'Expert Personas', icon: Users },
  { label: 'Tone & Style', icon: MessageCircle },
  { label: 'Course Content', icon: Sparkles },
];

export function WizardStepper({ currentPhase }: WizardStepperProps) {
  return (
    <nav aria-label="Wizard progress" className="flex items-start w-full mb-8">
      {PHASES.map((phase, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === currentPhase;
        const isCompleted = stepNumber < currentPhase;
        const isFuture = !isActive && !isCompleted;
        const Icon = isCompleted ? Check : phase.icon;
        // Connector before this step is purple if this step is active or completed
        const isConnectorDone = stepNumber <= currentPhase;

        return (
          <Fragment key={stepNumber}>
            {/* Dashed connector line */}
            {i > 0 && (
              <div
                className={`flex-1 h-0 mt-5 border-t-2 border-dashed ${
                  isConnectorDone ? 'border-indigo-500' : ''
                }`}
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
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                  isActive || isCompleted
                    ? 'bg-indigo-600 text-white'
                    : 'text-muted'
                }`}
                style={
                  isFuture
                    ? { border: '2px solid var(--border-default)' }
                    : undefined
                }
              >
                <Icon className="w-5 h-5" />
              </div>
              <span
                className={`text-xs font-medium mt-2 whitespace-nowrap hidden sm:block ${
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
  );
}
