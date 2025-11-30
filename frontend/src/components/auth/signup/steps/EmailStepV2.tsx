'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emailStepSchema, type EmailStepData } from '@/schemas';
import { ArrowRight, Loader2, Mail } from 'lucide-react';

interface EmailStepV2Props {
  defaultEmail: string;
  onSubmit: (email: string) => void;
  isLoading: boolean;
}

export function EmailStepV2({ defaultEmail, onSubmit, isLoading }: EmailStepV2Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<EmailStepData>({
    resolver: zodResolver(emailStepSchema),
    defaultValues: { email: defaultEmail },
    mode: 'onChange',
  });

  const onFormSubmit = (data: EmailStepData) => {
    onSubmit(data.email);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Let&apos;s get started
        </h2>
        <p className="text-slate-600">Enter your email address to begin.</p>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
          Email address
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            {...register('email')}
            type="email"
            id="email"
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            className={`
              w-full pl-10 pr-4 py-3 border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-500
              ${errors.email ? 'border-red-300' : 'border-slate-300'}
            `}
          />
        </div>
        {errors.email && (
          <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!isValid || isLoading}
        className={`
          w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg
          font-medium text-white transition-colors
          ${
            isValid && !isLoading
              ? 'bg-indigo-600 hover:bg-indigo-700'
              : 'bg-slate-300 cursor-not-allowed'
          }
        `}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking...
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </button>
    </form>
  );
}
