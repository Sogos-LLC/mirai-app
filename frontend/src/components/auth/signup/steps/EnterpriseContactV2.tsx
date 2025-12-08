'use client';

import { ArrowLeft, Loader2, Send } from 'lucide-react';
import type { RegistrationContext } from '@/machines/registrationMachine';

interface EnterpriseContactV2Props {
  data: RegistrationContext;
  onCancel: () => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
}

export function EnterpriseContactV2({
  data,
  onCancel,
  onSubmit,
  isLoading,
  error,
}: EnterpriseContactV2Props) {
  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-primary mb-2">
          Contact our sales team
        </h2>
        <p className="text-secondary">
          Enterprise plans are customized for your organization. Our team will reach out
          within 24 hours.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Pre-filled information */}
      <div className="p-4 bg-surface-elevated rounded-xl space-y-3">
        <h3 className="font-medium text-primary">Your information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-secondary">Name</span>
            <span className="text-primary">{data.firstName} {data.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">Email</span>
            <span className="text-primary">{data.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">Company</span>
            <span className="text-primary">{data.companyName}</span>
          </div>
          {data.industry && (
            <div className="flex justify-between">
              <span className="text-secondary">Industry</span>
              <span className="text-primary">{data.industry}</span>
            </div>
          )}
          {data.teamSize && (
            <div className="flex justify-between">
              <span className="text-secondary">Team size</span>
              <span className="text-primary">{data.teamSize}</span>
            </div>
          )}
        </div>
      </div>

      {/* Enterprise features */}
      <div className="p-4 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
        <h3 className="font-medium text-indigo-900 dark:text-indigo-200 mb-3">Enterprise includes:</h3>
        <ul className="space-y-2 text-sm text-indigo-800 dark:text-indigo-300">
          <li>• Dedicated account manager</li>
          <li>• Custom SLA with 99.99% uptime</li>
          <li>• Unlimited storage</li>
          <li>• SSO & advanced security features</li>
          <li>• Custom integrations</li>
          <li>• On-premise deployment option</li>
        </ul>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-secondary bg-hover hover:bg-hover transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to plans
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className={`
            flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg
            font-medium text-white transition-colors
            ${!isLoading ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-hover cursor-not-allowed'}
          `}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              Contact Sales
            </>
          )}
        </button>
      </div>
    </div>
  );
}
