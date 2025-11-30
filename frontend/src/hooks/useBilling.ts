import { useQuery, useMutation } from '@connectrpc/connect-query';
import {
  getBillingInfo,
  createCheckoutSession,
  createPortalSession,
} from '@/gen/mirai/v1/billing-BillingService_connectquery';
import { Plan, SubscriptionStatus } from '@/gen/mirai/v1/common_pb';
import { create } from '@bufbuild/protobuf';
import { CreateCheckoutSessionRequestSchema } from '@/gen/mirai/v1/billing_pb';
import {
  planToDisplayString,
  subscriptionStatusToDisplayString,
} from '@/lib/proto';

// Re-export types for convenience
export { Plan, SubscriptionStatus };

// Hook to get billing info
export function useGetBillingInfo() {
  const query = useQuery(getBillingInfo);

  return {
    data: query.data
      ? {
          // Proto enum values (for logic)
          plan: query.data.plan,
          status: query.data.status,
          // Display strings (for UI)
          planDisplay: planToDisplayString(query.data.plan),
          statusDisplay: subscriptionStatusToDisplayString(query.data.status),
          // Other fields
          seatCount: query.data.seatCount,
          pricePerSeat: query.data.pricePerSeat,
          currentPeriodEnd: query.data.currentPeriodEnd
            ? Number(query.data.currentPeriodEnd)
            : undefined,
          cancelAtPeriodEnd: query.data.cancelAtPeriodEnd,
        }
      : undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// Hook to create checkout session
export function useCreateCheckoutSession() {
  const mutation = useMutation(createCheckoutSession);

  return {
    mutate: async (plan: Plan.STARTER | Plan.PRO) => {
      const request = create(CreateCheckoutSessionRequestSchema, {
        plan,
      });
      return mutation.mutateAsync(request);
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// Hook to create portal session
export function useCreatePortalSession() {
  const mutation = useMutation(createPortalSession);

  return {
    mutate: async () => {
      return mutation.mutateAsync({});
    },
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
