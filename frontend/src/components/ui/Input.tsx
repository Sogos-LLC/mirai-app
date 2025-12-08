import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-2 text-base border rounded-lg outline-none transition-all
          bg-white dark:bg-dark-400
          border-gray-300 dark:border-dark-border-input
          text-gray-900 dark:text-dark-text
          placeholder:text-gray-400 dark:placeholder:text-dark-text-muted
          focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400
          focus:border-transparent
          ${error ? 'border-red-500 dark:border-red-400' : ''}
          ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
