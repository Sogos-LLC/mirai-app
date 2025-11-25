'use client';

import React from 'react';

interface HeaderProps {
  title?: string;
}

export default function Header({ title = 'MIRAI LOGO AND BRANDING' }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>
    </header>
  );
}
