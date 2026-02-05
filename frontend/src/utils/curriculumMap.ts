import { BookOpen, PenTool, RotateCcw } from 'lucide-react';
import {
  CoverageIntent,
  CoverageLevel,
} from '@/gen/mirai/v1/curriculum_map_pb';

/** Intent cycle order for clicking cells: unspecified -> teach -> reinforce -> assess -> unspecified */
export const INTENT_CYCLE: CoverageIntent[] = [
  CoverageIntent.TEACH,
  CoverageIntent.REINFORCE,
  CoverageIntent.ASSESS,
  CoverageIntent.UNSPECIFIED,
];

/** Level cycle order */
export const LEVEL_CYCLE: CoverageLevel[] = [
  CoverageLevel.INTRODUCE,
  CoverageLevel.DEVELOP,
  CoverageLevel.MASTER,
];

/** Returns a human-readable label for the given coverage intent. */
export function intentLabel(intent: CoverageIntent): string {
  switch (intent) {
    case CoverageIntent.TEACH: return 'Teach';
    case CoverageIntent.ASSESS: return 'Assess';
    case CoverageIntent.REINFORCE: return 'Reinforce';
    default: return '';
  }
}

/** Returns the Tailwind background color class for the given coverage intent. */
export function intentColor(intent: CoverageIntent): string {
  switch (intent) {
    case CoverageIntent.TEACH: return 'bg-green-500';
    case CoverageIntent.ASSESS: return 'bg-indigo-500';
    case CoverageIntent.REINFORCE: return 'bg-cyan-500';
    default: return '';
  }
}

/** Returns the Lucide icon component for the given coverage intent. */
export function intentIcon(intent: CoverageIntent) {
  switch (intent) {
    case CoverageIntent.TEACH: return BookOpen;
    case CoverageIntent.ASSESS: return PenTool;
    case CoverageIntent.REINFORCE: return RotateCcw;
    default: return null;
  }
}

/** Returns a short label for the given coverage level. */
export function levelLabel(level: CoverageLevel): string {
  switch (level) {
    case CoverageLevel.INTRODUCE: return 'Intro';
    case CoverageLevel.DEVELOP: return 'Develop';
    case CoverageLevel.MASTER: return 'Master';
    default: return '';
  }
}
