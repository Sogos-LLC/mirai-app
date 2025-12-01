'use client';

import type { TargetAudienceTemplate, ExperienceLevel } from '@/gen/mirai/v1/target_audience_pb';

interface TargetAudienceCardProps {
  template: TargetAudienceTemplate;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
}

const EXPERIENCE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Unspecified', color: 'bg-gray-100 text-gray-700' },
  1: { label: 'Beginner', color: 'bg-green-100 text-green-800' },
  2: { label: 'Intermediate', color: 'bg-blue-100 text-blue-800' },
  3: { label: 'Advanced', color: 'bg-purple-100 text-purple-800' },
  4: { label: 'Expert', color: 'bg-amber-100 text-amber-800' },
};

export function TargetAudienceCard({
  template,
  onSelect,
  onEdit,
  onDelete,
  isSelected = false,
}: TargetAudienceCardProps) {
  const experience = EXPERIENCE_LABELS[template.experienceLevel] || EXPERIENCE_LABELS[0];

  return (
    <div
      className={`bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      }`}
      onClick={onSelect}
    >
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-gray-900 truncate">{template.name}</h3>
          <div className="flex items-center space-x-2">
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="text-gray-400 hover:text-gray-600"
                title="Edit"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-red-400 hover:text-red-600"
                title="Delete"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {template.description && (
          <p className="text-sm text-gray-500 mb-3 line-clamp-2">{template.description}</p>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {template.role && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800">
              {template.role}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${experience.color}`}>
            {experience.label}
          </span>
        </div>

        {template.learningGoals && template.learningGoals.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Learning Goals:</p>
            <ul className="text-xs text-gray-600 space-y-0.5">
              {template.learningGoals.slice(0, 2).map((goal, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-green-500 mr-1">•</span>
                  <span className="line-clamp-1">{goal}</span>
                </li>
              ))}
              {template.learningGoals.length > 2 && (
                <li className="text-gray-400">+{template.learningGoals.length - 2} more</li>
              )}
            </ul>
          </div>
        )}

        {template.challenges && template.challenges.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Challenges:</p>
            <ul className="text-xs text-gray-600 space-y-0.5">
              {template.challenges.slice(0, 2).map((challenge, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-amber-500 mr-1">•</span>
                  <span className="line-clamp-1">{challenge}</span>
                </li>
              ))}
              {template.challenges.length > 2 && (
                <li className="text-gray-400">+{template.challenges.length - 2} more</li>
              )}
            </ul>
          </div>
        )}

        {template.createdAt && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
            Created {new Date(Number(template.createdAt.seconds) * 1000).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
