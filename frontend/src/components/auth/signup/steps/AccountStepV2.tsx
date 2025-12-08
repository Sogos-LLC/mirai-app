'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountStepSchema, type AccountStepData } from '@/schemas';
import { ArrowLeft, ArrowRight, Eye, EyeOff, User, Lock, Check, X } from 'lucide-react';

interface AccountStepV2Props {
  defaultValues: {
    firstName: string;
    lastName: string;
    password: string;
  };
  onSubmit: (data: AccountStepData) => void;
  onBack: () => void;
}

export function AccountStepV2({ defaultValues, onSubmit, onBack }: AccountStepV2Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<AccountStepData>({
    resolver: zodResolver(accountStepSchema),
    defaultValues: {
      ...defaultValues,
      confirmPassword: defaultValues.password,
    },
    mode: 'onChange',
  });

  const password = watch('password', '');

  // Password requirements for visual feedback
  const requirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
  ];

  const onFormSubmit = (data: AccountStepData) => {
    // Only pass what the machine needs
    onSubmit({
      firstName: data.firstName,
      lastName: data.lastName,
      password: data.password,
      confirmPassword: data.confirmPassword,
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-primary mb-2">
          Create your account
        </h2>
        <p className="text-secondary">Set up your login credentials.</p>
      </div>

      {/* Name fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-secondary mb-2">
            First name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
            <input
              {...register('firstName')}
              type="text"
              id="firstName"
              autoFocus
              placeholder="John"
              className={`
                w-full pl-10 pr-4 py-3 border rounded-lg bg-surface text-primary placeholder:text-muted
                focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
                ${errors.firstName ? 'border-red-300 dark:border-red-700' : ''}
              `}
            />
          </div>
          {errors.firstName && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.firstName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-secondary mb-2">
            Last name
          </label>
          <input
            {...register('lastName')}
            type="text"
            id="lastName"
            placeholder="Doe"
            className={`
              w-full px-4 py-3 border rounded-lg bg-surface text-primary placeholder:text-muted
              focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
              ${errors.lastName ? 'border-red-300 dark:border-red-700' : ''}
            `}
          />
          {errors.lastName && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-secondary mb-2">
          Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
          <input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            id="password"
            placeholder="Create a strong password"
            className={`
              w-full pl-10 pr-12 py-3 border rounded-lg bg-surface text-primary placeholder:text-muted
              focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
              ${errors.password ? 'border-red-300 dark:border-red-700' : ''}
            `}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        {/* Password requirements */}
        <div className="mt-3 space-y-1">
          {requirements.map((req) => (
            <div
              key={req.label}
              className={`flex items-center gap-2 text-sm ${
                req.met ? 'text-green-600 dark:text-green-400' : 'text-muted'
              }`}
            >
              {req.met ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              {req.label}
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-secondary mb-2">
          Confirm password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
          <input
            {...register('confirmPassword')}
            type={showConfirmPassword ? 'text' : 'password'}
            id="confirmPassword"
            placeholder="Confirm your password"
            className={`
              w-full pl-10 pr-12 py-3 border rounded-lg bg-surface text-primary placeholder:text-muted
              focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
              ${errors.confirmPassword ? 'border-red-300 dark:border-red-700' : ''}
            `}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
          >
            {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-secondary bg-hover hover:bg-hover transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>
        <button
          type="submit"
          disabled={!isValid}
          className={`
            flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg
            font-medium text-white transition-colors
            ${isValid ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-hover cursor-not-allowed'}
          `}
        >
          Continue
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}
