'use client';

import { useState } from 'react';
import { ArrowLeft, Check, Loader2, Minus, Plus } from 'lucide-react';
import { Plan } from '@/gen/mirai/v1/common_pb';

interface PlanStepV2Props {
  defaultValues: {
    plan: Plan;
    seatCount: number;
  };
  onSubmit: (data: { plan: Plan; seatCount: number }) => void;
  onBack: () => void;
  onSelectEnterprise: () => void;
  isLoading: boolean;
}

interface PlanOption {
  id: Plan;
  name: string;
  price: number;
  description: string;
  features: string[];
  popular?: boolean;
}

const PLANS: PlanOption[] = [
  {
    id: Plan.STARTER,
    name: 'Starter',
    price: 8,
    description: 'For small teams getting started',
    features: [
      'Up to 10 team members',
      'Basic analytics',
      'Email support',
      '5GB storage',
    ],
  },
  {
    id: Plan.PRO,
    name: 'Pro',
    price: 12,
    description: 'For growing teams',
    features: [
      'Unlimited team members',
      'Advanced analytics',
      'Priority support',
      '50GB storage',
      'Custom integrations',
    ],
    popular: true,
  },
  {
    id: Plan.ENTERPRISE,
    name: 'Enterprise',
    price: 0,
    description: 'For large organizations',
    features: [
      'Everything in Pro',
      'Dedicated account manager',
      'Custom SLA',
      'Unlimited storage',
      'SSO & advanced security',
    ],
  },
];

export function PlanStepV2({
  defaultValues,
  onSubmit,
  onBack,
  onSelectEnterprise,
  isLoading,
}: PlanStepV2Props) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(defaultValues.plan);
  const [seatCount, setSeatCount] = useState(defaultValues.seatCount);

  const currentPlan = PLANS.find((p) => p.id === selectedPlan)!;
  const monthlyTotal = currentPlan.price * seatCount;

  const handlePlanSelect = (plan: Plan) => {
    if (plan === Plan.ENTERPRISE) {
      onSelectEnterprise();
    } else {
      setSelectedPlan(plan);
    }
  };

  const handleSubmit = () => {
    onSubmit({ plan: selectedPlan, seatCount });
  };

  const incrementSeats = () => setSeatCount((s) => s + 1);
  const decrementSeats = () => setSeatCount((s) => Math.max(1, s - 1));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Choose your plan
        </h2>
        <p className="text-slate-600">Select the plan that works best for your team.</p>
      </div>

      {/* Plan cards */}
      <div className="space-y-4">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => handlePlanSelect(plan.id)}
            className={`
              w-full p-4 border-2 rounded-xl text-left transition-all relative
              ${
                selectedPlan === plan.id
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-slate-200 hover:border-slate-300'
              }
            `}
          >
            {plan.popular && (
              <span className="absolute -top-3 right-4 px-3 py-1 bg-indigo-600 text-white text-xs font-medium rounded-full">
                Most Popular
              </span>
            )}

            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                <p className="text-sm text-slate-600 mt-1">{plan.description}</p>
              </div>
              <div className="text-right">
                {plan.price > 0 ? (
                  <>
                    <span className="text-2xl font-bold text-slate-900">${plan.price}</span>
                    <span className="text-slate-600">/seat/mo</span>
                  </>
                ) : (
                  <span className="text-lg font-semibold text-slate-900">Contact us</span>
                )}
              </div>
            </div>

            {/* Features list */}
            <ul className="mt-4 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            {/* Selection indicator */}
            {selectedPlan === plan.id && plan.id !== Plan.ENTERPRISE && (
              <div className="absolute top-4 right-4">
                <div className="h-6 w-6 bg-indigo-600 rounded-full flex items-center justify-center">
                  <Check className="h-4 w-4 text-white" />
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Seat counter (only for paid plans) */}
      {selectedPlan !== Plan.ENTERPRISE && (
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-900">Number of seats</h4>
              <p className="text-sm text-slate-600">Add seats for your team members</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={decrementSeats}
                disabled={seatCount <= 1}
                className="h-10 w-10 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="text-xl font-semibold w-12 text-center">{seatCount}</span>
              <button
                type="button"
                onClick={incrementSeats}
                className="h-10 w-10 flex items-center justify-center border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Price summary */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex justify-between text-lg">
              <span className="text-slate-600">Monthly total</span>
              <span className="font-bold text-slate-900">${monthlyTotal}/month</span>
            </div>
          </div>
        </div>
      )}

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
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || selectedPlan === Plan.ENTERPRISE}
          className={`
            flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg
            font-medium text-white transition-colors
            ${
              !isLoading && selectedPlan !== Plan.ENTERPRISE
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-slate-300 cursor-not-allowed'
            }
          `}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            'Get Started'
          )}
        </button>
      </div>
    </div>
  );
}
