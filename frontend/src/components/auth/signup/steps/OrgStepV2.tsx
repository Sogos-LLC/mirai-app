'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { orgStepSchema, type OrgStepData } from '@/schemas';
import { ArrowLeft, ArrowRight, Building2 } from 'lucide-react';

interface OrgStepV2Props {
  defaultValues: {
    companyName: string;
    industry: string;
    teamSize: string;
  };
  onSubmit: (data: OrgStepData) => void;
  onBack: () => void;
}

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Retail',
  'Manufacturing',
  'Other',
];

const TEAM_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];

export function OrgStepV2({ defaultValues, onSubmit, onBack }: OrgStepV2Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<OrgStepData>({
    resolver: zodResolver(orgStepSchema),
    defaultValues,
    mode: 'onChange',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Tell us about your organization
        </h2>
        <p className="text-slate-600">This helps us customize your experience.</p>
      </div>

      {/* Company Name */}
      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-2">
          Company name <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            {...register('companyName')}
            type="text"
            id="companyName"
            autoFocus
            placeholder="Acme Inc."
            className={`
              w-full pl-10 pr-4 py-3 border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-500
              ${errors.companyName ? 'border-red-300' : 'border-slate-300'}
            `}
          />
        </div>
        {errors.companyName && (
          <p className="mt-2 text-sm text-red-600">{errors.companyName.message}</p>
        )}
      </div>

      {/* Industry (optional) */}
      <div>
        <label htmlFor="industry" className="block text-sm font-medium text-slate-700 mb-2">
          Industry <span className="text-slate-400">(optional)</span>
        </label>
        <select
          {...register('industry')}
          id="industry"
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select industry</option>
          {INDUSTRIES.map((industry) => (
            <option key={industry} value={industry}>
              {industry}
            </option>
          ))}
        </select>
      </div>

      {/* Team Size (optional) */}
      <div>
        <label htmlFor="teamSize" className="block text-sm font-medium text-slate-700 mb-2">
          Team size <span className="text-slate-400">(optional)</span>
        </label>
        <select
          {...register('teamSize')}
          id="teamSize"
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select team size</option>
          {TEAM_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} employees
            </option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
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
            ${isValid ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300 cursor-not-allowed'}
          `}
        >
          Continue
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}
