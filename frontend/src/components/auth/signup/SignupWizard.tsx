'use client';

import { useRegistration } from './hooks/useRegistration';
import { EmailStepV2 } from './steps/EmailStepV2';
import { OrgStepV2 } from './steps/OrgStepV2';
import { AccountStepV2 } from './steps/AccountStepV2';
import { PlanStepV2 } from './steps/PlanStepV2';
import { EnterpriseContactV2 } from './steps/EnterpriseContactV2';
import { SuccessStep } from './steps/SuccessStep';
import { Loader2 } from 'lucide-react';
import { getStepLabel, STEPS } from '@/machines/registrationMachine';

/**
 * SignupWizard - Registration flow using XState
 *
 * Architecture:
 * - State machine controls all flow logic (transitions, validation, side effects)
 * - This component is purely presentational - renders current step
 * - Each step component handles its own form with React Hook Form + Zod
 * - No local state - everything flows through the machine
 */
export function SignupWizard() {
  const registration = useRegistration();

  // Show loading overlay during async operations
  if (registration.isLoading && !registration.isEmailStep) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-4" />
          <p className="text-slate-600">
            {registration.state === 'submitting'
              ? 'Processing registration...'
              : registration.state === 'redirectingToCheckout'
                ? 'Redirecting to payment...'
                : 'Please wait...'}
          </p>
        </div>
      </div>
    );
  }

  // Success states
  if (registration.isSuccess || registration.isEnterpriseSuccess) {
    return (
      <SuccessStep
        isEnterprise={registration.isEnterpriseSuccess}
        companyName={registration.data.companyName}
      />
    );
  }

  // Enterprise contact form (side flow)
  if (registration.isEnterpriseContact) {
    return (
      <EnterpriseContactV2
        data={registration.data}
        onCancel={registration.cancelEnterprise}
        onSubmit={registration.submit}
        isLoading={registration.isLoading}
        error={registration.error}
      />
    );
  }

  // Main wizard flow
  return (
    <div className="w-full max-w-md mx-auto">
      {/* Progress indicator */}
      <ProgressBar
        currentStep={registration.stepIndex}
        totalSteps={registration.totalSteps}
      />

      {/* Step labels */}
      <div className="flex justify-between mb-8 px-2">
        {STEPS.map((step, index) => (
          <span
            key={step}
            className={`text-xs font-medium ${
              index <= registration.stepIndex
                ? 'text-indigo-600'
                : 'text-slate-400'
            }`}
          >
            {getStepLabel(step)}
          </span>
        ))}
      </div>

      {/* Error display */}
      {registration.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{registration.error}</p>
        </div>
      )}

      {/* Current step */}
      {registration.isEmailStep && (
        <EmailStepV2
          defaultEmail={registration.data.email}
          onSubmit={(email) => {
            registration.setEmail(email);
            registration.next();
          }}
          isLoading={registration.state === 'checkingEmail'}
        />
      )}

      {registration.isOrgStep && (
        <OrgStepV2
          defaultValues={{
            companyName: registration.data.companyName,
            industry: registration.data.industry,
            teamSize: registration.data.teamSize,
          }}
          onSubmit={(data) => {
            registration.setOrg(data.companyName, data.industry, data.teamSize);
            registration.next();
          }}
          onBack={registration.back}
        />
      )}

      {registration.isAccountStep && (
        <AccountStepV2
          defaultValues={{
            firstName: registration.data.firstName,
            lastName: registration.data.lastName,
            password: registration.data.password,
          }}
          onSubmit={(data) => {
            registration.setAccount(data.firstName, data.lastName, data.password);
            registration.next();
          }}
          onBack={registration.back}
        />
      )}

      {registration.isPlanStep && (
        <PlanStepV2
          defaultValues={{
            plan: registration.data.plan,
            seatCount: registration.data.seatCount,
          }}
          onSubmit={(data) => {
            registration.setPlan(data.plan, data.seatCount);
            registration.submit();
          }}
          onBack={registration.back}
          onSelectEnterprise={registration.selectEnterprise}
          isLoading={registration.isLoading}
        />
      )}

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-slate-100 rounded text-xs font-mono">
          <p>State: {registration.state}</p>
          <p>Step: {registration.currentStep} ({registration.stepIndex + 1}/{registration.totalSteps})</p>
        </div>
      )}
    </div>
  );
}

/**
 * Progress bar component
 */
function ProgressBar({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="mb-6">
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-600 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
