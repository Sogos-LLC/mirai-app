'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  CoverageIntent,
  CoverageLevel,
} from '@/gen/mirai/v1/curriculum_map_pb';
import type { CurriculumMap, CoverageCell } from '@/gen/mirai/v1/curriculum_map_pb';
import { intentLabel, intentColor, intentIcon, levelLabel } from '@/utils/curriculumMap';

export interface CoverageMatrixProps {
  /** The full curriculum map data. */
  curriculumMap: CurriculumMap;
  /** Currently editing cell coordinates, or null. */
  editingCell: { sectionId: string; outcomeId: string } | null;
  /** Whether the curriculum map is approved (disables editing). */
  isApproved: boolean;
  /** Called when a cell is clicked for editing. */
  onCellClick: (sectionId: string, outcomeId: string, cell: CoverageCell) => void;
  /** Called when the user selects an intent/level from the cell editor. */
  onCellEdit: (sectionId: string, outcomeId: string, intent: CoverageIntent, level: CoverageLevel) => void;
  /** Called when the cell editor is closed without changes. */
  onCellEditorClose: () => void;
}

/**
 * Inline cell editor -- shown when a coverage cell is clicked.
 * Allows picking intent (Teach/Assess/Reinforce/Clear) and level.
 */
function CellEditor({
  currentIntent,
  currentLevel,
  onSelect,
  onClose,
}: {
  currentIntent: CoverageIntent;
  currentLevel: CoverageLevel;
  onSelect: (intent: CoverageIntent, level: CoverageLevel) => void;
  onClose: () => void;
}) {
  const [selectedIntent, setSelectedIntent] = useState<CoverageIntent>(currentIntent);
  const [selectedLevel, setSelectedLevel] = useState<CoverageLevel>(
    currentLevel === CoverageLevel.UNSPECIFIED ? CoverageLevel.INTRODUCE : currentLevel
  );

  const intents = [
    { value: CoverageIntent.TEACH, label: 'Teach', color: 'bg-green-500 hover:bg-green-600' },
    { value: CoverageIntent.ASSESS, label: 'Assess', color: 'bg-indigo-500 hover:bg-indigo-600' },
    { value: CoverageIntent.REINFORCE, label: 'Reinforce', color: 'bg-cyan-500 hover:bg-cyan-600' },
  ];

  const levels = [
    { value: CoverageLevel.INTRODUCE, label: 'Intro' },
    { value: CoverageLevel.DEVELOP, label: 'Dev' },
    { value: CoverageLevel.MASTER, label: 'Master' },
  ];

  return (
    <div className="absolute z-20 top-0 left-1/2 -translate-x-1/2 bg-surface border rounded-lg shadow-lg p-2 min-w-[140px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted">Set coverage</span>
        <button onClick={onClose} className="p-0.5 hover:bg-hover rounded">
          <X className="w-3 h-3 text-muted" />
        </button>
      </div>
      <div className="flex flex-col gap-1 mb-1.5">
        {intents.map((i) => (
          <button
            key={i.value}
            onClick={() => setSelectedIntent(i.value)}
            className={`px-2 py-1 rounded text-[11px] font-medium text-white transition-all ${i.color} ${
              selectedIntent === i.value ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-60'
            }`}
          >
            {i.label}
          </button>
        ))}
      </div>
      {selectedIntent !== CoverageIntent.UNSPECIFIED && (
        <div className="flex gap-0.5 mb-1.5">
          {levels.map((l) => (
            <button
              key={l.value}
              onClick={() => setSelectedLevel(l.value)}
              className={`flex-1 px-1 py-0.5 rounded text-[10px] transition-all ${
                selectedLevel === l.value
                  ? 'bg-active text-primary font-semibold'
                  : 'bg-hover text-muted hover:text-secondary'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <button
          onClick={() => onSelect(selectedIntent, selectedLevel)}
          className="flex-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-medium"
        >
          Apply
        </button>
        <button
          onClick={() => onSelect(CoverageIntent.UNSPECIFIED, CoverageLevel.UNSPECIFIED)}
          className="px-2 py-1 rounded bg-hover hover:bg-active text-muted text-[10px]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/**
 * Displays the coverage matrix table with sticky header row, outcome column
 * headers, interactive cells with inline editor, and a legend row.
 */
export function CoverageMatrix({
  curriculumMap,
  editingCell,
  isApproved,
  onCellClick,
  onCellEdit,
  onCellEditorClose,
}: CoverageMatrixProps) {
  const outcomes = curriculumMap.rows?.[0]?.cells?.map(cell => ({
    id: cell.outcomeId,
    text: cell.outcomeText,
  })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Coverage Matrix</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-elevated">
                <th className="text-left px-4 py-3 font-medium text-secondary border-b sticky left-0 bg-surface-elevated z-10 min-w-[180px]">
                  Section
                </th>
                {outcomes.map((outcome, idx) => (
                  <th
                    key={outcome.id}
                    className="px-2 py-3 font-medium text-center border-b min-w-[90px]"
                    title={outcome.text}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs font-bold text-primary">O{idx + 1}</span>
                      <span className="text-[10px] text-muted truncate max-w-[80px]">
                        {outcome.text
                          ? outcome.text.length > 20
                            ? outcome.text.substring(0, 20) + '...'
                            : outcome.text
                          : ''}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {curriculumMap.rows?.map((row) => (
                <tr key={row.sectionId} className="group">
                  <td className="px-4 py-3 border-b sticky left-0 bg-surface z-10 group-hover:bg-hover">
                    <div className="font-medium text-primary text-xs">{row.sectionTitle}</div>
                    <div className="text-[10px] text-muted">Section {row.sectionOrder}</div>
                  </td>
                  {row.cells?.map((cell) => {
                    const isCovered = cell.intent !== CoverageIntent.UNSPECIFIED;
                    const isEditing = editingCell?.sectionId === row.sectionId && editingCell?.outcomeId === cell.outcomeId;
                    const Icon = intentIcon(cell.intent);

                    return (
                      <td key={cell.outcomeId} className="px-1 py-1.5 border-b text-center group-hover:bg-hover relative">
                        {isEditing ? (
                          <CellEditor
                            currentIntent={cell.intent}
                            currentLevel={cell.level}
                            onSelect={(intent, level) => onCellEdit(row.sectionId, cell.outcomeId, intent, level)}
                            onClose={onCellEditorClose}
                          />
                        ) : (
                          <button
                            onClick={() => onCellClick(row.sectionId, cell.outcomeId, cell)}
                            disabled={isApproved}
                            className={`w-full min-h-[44px] rounded-md transition-all ${
                              isApproved ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700'
                            } ${isCovered ? '' : 'hover:bg-active'}`}
                            title={isCovered
                              ? `${intentLabel(cell.intent)} - ${levelLabel(cell.level)}`
                              : isApproved ? 'Not covered' : 'Click to set coverage'
                            }
                          >
                            {isCovered ? (
                              <div className={`inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md ${intentColor(cell.intent)} text-white text-[11px] font-medium`}>
                                {Icon && <Icon className="w-3 h-3" />}
                                <span>{intentLabel(cell.intent)}</span>
                                <span className="text-[9px] opacity-75">{levelLabel(cell.level)}</span>
                              </div>
                            ) : (
                              <span className="text-muted text-xs">
                                {isApproved ? '-' : '+'}
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500" />
            <span className="text-secondary">Teach</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
            <span className="text-secondary">Assess</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
            <span className="text-secondary">Reinforce</span>
          </div>
          <span className="text-muted">|</span>
          <span className="text-muted">Levels: Intro, Develop, Master</span>
          {!isApproved && (
            <>
              <span className="text-muted">|</span>
              <span className="text-muted">Click a cell to edit</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
