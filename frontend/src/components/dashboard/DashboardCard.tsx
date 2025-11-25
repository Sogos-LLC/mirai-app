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
      className="bg-primary-200 rounded-3xl p-8 text-left hover:bg-primary-300 transition-colors w-full"
    >
      {icon && <div className="mb-4">{icon}</div>}
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-700">{description}</p>
    </button>
  );
}
