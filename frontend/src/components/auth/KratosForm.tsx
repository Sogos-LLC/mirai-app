'use client';

import React, { useState } from 'react';
import type { UiContainer, UiNode, UiText } from '@/lib/kratos/types';
import { AlertCircle, CheckCircle, Info, Eye, EyeOff } from 'lucide-react';

interface KratosFormProps {
  ui: UiContainer;
  onlyGroups?: string[];
  hideGroups?: string[];
  /** Show password confirmation field for new password entry (registration, settings). Default: false */
  showPasswordConfirmation?: boolean;
}

/**
 * Renders Kratos UI nodes as a form
 */
export default function KratosForm({ ui, onlyGroups, hideGroups = [], showPasswordConfirmation = false }: KratosFormProps) {
  const filteredNodes = ui.nodes.filter((node) => {
    // Always include hidden inputs - they contain CSRF tokens and other
    // fields required for form submission, regardless of which "tab" is active
    const isHiddenInput = node.type === 'input' && node.attributes.type === 'hidden';
    if (isHiddenInput) return true;

    if (hideGroups.includes(node.group)) return false;
    if (onlyGroups && !onlyGroups.includes(node.group)) return false;
    return true;
  });

  return (
    <form action={ui.action} method={ui.method} className="space-y-4">
      {/* Global messages */}
      {ui.messages && ui.messages.length > 0 && (
        <div className="space-y-2">
          {ui.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </div>
      )}

      {/* Form fields */}
      {filteredNodes.map((node, index) => (
        <Node key={`${node.attributes.name || index}`} node={node} showPasswordConfirmation={showPasswordConfirmation} />
      ))}
    </form>
  );
}

function Node({ node, showPasswordConfirmation }: { node: UiNode; showPasswordConfirmation: boolean }) {
  const { attributes, messages, meta } = node;

  // Handle different node types
  switch (node.type) {
    case 'input':
      return <InputNode node={node} showPasswordConfirmation={showPasswordConfirmation} />;
    case 'text':
      return (
        <div className="text-sm text-slate-600 dark:text-gray-400">
          {meta.label?.text || attributes.title}
        </div>
      );
    case 'a':
      return (
        <a
          href={attributes.href}
          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-sm font-medium"
        >
          {meta.label?.text || 'Link'}
        </a>
      );
    default:
      return null;
  }
}

function InputNode({ node, showPasswordConfirmation }: { node: UiNode; showPasswordConfirmation: boolean }) {
  const { attributes, messages, meta } = node;
  const hasError = messages?.some((m) => m.type === 'error');
  const inputType = attributes.type || 'text';

  // Hidden inputs
  if (inputType === 'hidden') {
    return (
      <input
        type="hidden"
        name={attributes.name}
        value={attributes.value as string}
      />
    );
  }

  // Submit buttons
  if (inputType === 'submit') {
    return (
      <button
        type="submit"
        name={attributes.name}
        value={attributes.value as string}
        disabled={attributes.disabled}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
      >
        {meta.label?.text || 'Submit'}
      </button>
    );
  }

  // Checkbox inputs
  if (inputType === 'checkbox') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          name={attributes.name}
          defaultChecked={attributes.value as boolean}
          disabled={attributes.disabled}
          className="w-4 h-4 text-indigo-600 border-slate-300 dark:border-dark-border rounded focus:ring-indigo-500 dark:bg-dark-400"
        />
        <span className="text-sm text-slate-700 dark:text-gray-300">{meta.label?.text}</span>
      </label>
    );
  }

  // Password inputs with visibility toggle
  if (inputType === 'password') {
    return <PasswordInputNode node={node} showConfirmation={showPasswordConfirmation} />;
  }

  // Regular inputs
  return (
    <div>
      {meta.label && (
        <label
          htmlFor={attributes.name}
          className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1"
        >
          {meta.label.text}
          {attributes.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        id={attributes.name}
        type={inputType}
        name={attributes.name}
        defaultValue={attributes.value as string}
        required={attributes.required}
        disabled={attributes.disabled}
        pattern={attributes.pattern}
        autoComplete={getAutoComplete(attributes.name)}
        className={`w-full px-4 py-3 rounded-lg border bg-white dark:bg-dark-400 text-gray-900 dark:text-white ${
          hasError
            ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500'
            : 'border-slate-300 dark:border-dark-border focus:border-indigo-500 focus:ring-indigo-500'
        } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors`}
      />
      {/* Field messages */}
      {messages && messages.length > 0 && (
        <div className="mt-1 space-y-1">
          {messages.map((message) => (
            <p
              key={message.id}
              className={`text-sm ${
                message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-gray-400'
              }`}
            >
              {message.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function PasswordInputNode({ node, showConfirmation }: { node: UiNode; showConfirmation: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const { attributes, messages, meta } = node;
  const hasError = messages?.some((m) => m.type === 'error');

  const validatePasswords = () => {
    const password = passwordRef.current?.value || '';
    if (confirmPassword && password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      return false;
    }
    setConfirmError(null);
    return true;
  };

  const handlePasswordChange = () => {
    if (showConfirmation && confirmPassword) {
      const password = passwordRef.current?.value || '';
      if (password !== confirmPassword) {
        setConfirmError('Passwords do not match');
      } else {
        setConfirmError(null);
      }
    }
  };

  const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newConfirm = e.target.value;
    setConfirmPassword(newConfirm);
    const password = passwordRef.current?.value || '';
    if (newConfirm && password !== newConfirm) {
      setConfirmError('Passwords do not match');
    } else {
      setConfirmError(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Password field */}
      <div>
        {meta.label && (
          <label
            htmlFor={attributes.name}
            className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1"
          >
            {meta.label.text}
            {attributes.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={passwordRef}
            id={attributes.name}
            type={showPassword ? 'text' : 'password'}
            name={attributes.name}
            defaultValue={attributes.value as string}
            onChange={handlePasswordChange}
            required={attributes.required}
            disabled={attributes.disabled}
            pattern={attributes.pattern}
            autoComplete={getAutoComplete(attributes.name)}
            className={`w-full px-4 py-3 pr-12 rounded-lg border bg-white dark:bg-dark-400 text-gray-900 dark:text-white ${
              hasError
                ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500'
                : 'border-slate-300 dark:border-dark-border focus:border-indigo-500 focus:ring-indigo-500'
            } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
        {/* Field messages */}
        {messages && messages.length > 0 && (
          <div className="mt-1 space-y-1">
            {messages.map((message) => (
              <p
                key={message.id}
                className={`text-sm ${
                  message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-gray-400'
                }`}
              >
                {message.text}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Confirm password field - only shown for new password entry */}
      {showConfirmation && (
        <div>
          <label
            htmlFor={`${attributes.name}-confirm`}
            className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1"
          >
            Confirm Password
            {attributes.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="relative">
            <input
              id={`${attributes.name}-confirm`}
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={handleConfirmChange}
              onBlur={validatePasswords}
              required={attributes.required}
              disabled={attributes.disabled}
              autoComplete="new-password"
              className={`w-full px-4 py-3 pr-12 rounded-lg border bg-white dark:bg-dark-400 text-gray-900 dark:text-white ${
                confirmError
                  ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-300 dark:border-dark-border focus:border-indigo-500 focus:ring-indigo-500'
              } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
              tabIndex={-1}
            >
              {showConfirm ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          {confirmError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{confirmError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Message({ message }: { message: UiText }) {
  const icons = {
    error: AlertCircle,
    success: CheckCircle,
    info: Info,
  };
  const colors = {
    error: 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800',
    success: 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  };

  const Icon = icons[message.type] || Info;
  const colorClass = colors[message.type] || colors.info;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${colorClass}`}>
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <p className="text-sm">{message.text}</p>
    </div>
  );
}

function getAutoComplete(name?: string): string | undefined {
  if (!name) return undefined;
  const map: Record<string, string> = {
    'traits.email': 'email',
    email: 'email',
    password: 'current-password',
    'traits.name.first': 'given-name',
    'traits.name.last': 'family-name',
    'traits.company.name': 'organization',
  };
  return map[name];
}
