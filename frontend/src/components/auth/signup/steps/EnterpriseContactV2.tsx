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
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Contact our sales team
        </h2>
        <p className="text-slate-600">
          Enterprise plans are customized for your organization. Our team will reach out
          within 24 hours.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Pre-filled information */}
      <div className="p-4 bg-slate-50 rounded-xl space-y-3">
        <h3 className="font-medium text-slate-900">Your information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Name</span>
            <span className="text-slate-900">{data.firstName} {data.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Email</span>
            <span className="text-slate-900">{data.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Company</span>
            <span className="text-slate-900">{data.companyName}</span>
          </div>
          {data.industry && (
            <div className="flex justify-between">
              <span className="text-slate-600">Industry</span>
              <span className="text-slate-900">{data.industry}</span>
            </div>
          )}
          {data.teamSize && (
            <div className="flex justify-between">
              <span className="text-slate-600">Team size</span>
              <span className="text-slate-900">{data.teamSize}</span>
            </div>
          )}
        </div>
      </div>

      {/* Enterprise features */}
      <div className="p-4 border border-indigo-200 bg-indigo-50 rounded-xl">
        <h3 className="font-medium text-indigo-900 mb-3">Enterprise includes:</h3>
        <ul className="space-y-2 text-sm text-indigo-800">
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
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
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
            ${!isLoading ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300 cursor-not-allowed'}
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
