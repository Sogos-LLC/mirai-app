import React from 'react';

interface DashboardCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export default function DashboardCard({
  title,
  description,
  icon,
  onClick,
}: DashboardCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl p-6 text-left hover:shadow-lg dark:hover:shadow-glow-sm hover:border-primary-300 dark:hover:border-primary-600 transition-all w-full"
    >
      {icon && <div className="mb-4">{icon}</div>}
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </button>
  );
}
