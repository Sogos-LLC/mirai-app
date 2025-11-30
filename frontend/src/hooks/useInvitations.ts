/**
 * useInvitations Hook
 *
 * React Query hooks for managing team invitations.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '@/lib/connect';
import {
  InvitationService,
  InvitationStatus,
  type Invitation,
  type SeatInfo,
} from '@/gen/mirai/v1/invitation_pb';
import { Role } from '@/gen/mirai/v1/common_pb';

// Re-export types for convenience
export { InvitationStatus, Role };
export type { Invitation, SeatInfo };

// =============================================================================
// Client
// =============================================================================

const invitationClient = createClient(InvitationService, transport);

// =============================================================================
// Query Keys
// =============================================================================

export const invitationKeys = {
  all: ['invitations'] as const,
  list: (statuses?: InvitationStatus[]) => [...invitationKeys.all, 'list', statuses] as const,
  seatInfo: () => [...invitationKeys.all, 'seatInfo'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Get list of invitations for the company
 */
export function useListInvitations(statuses?: InvitationStatus[]) {
  return useQuery({
    queryKey: invitationKeys.list(statuses),
    queryFn: async () => {
      const response = await invitationClient.listInvitations({
        statusFilter: statuses || [],
      });
      return response.invitations;
    },
  });
}

/**
 * Get seat information for the company
 */
export function useGetSeatInfo() {
  return useQuery({
    queryKey: invitationKeys.seatInfo(),
    queryFn: async () => {
      const response = await invitationClient.getSeatInfo({});
      return response.seatInfo;
    },
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new invitation
 */
export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Role }) => {
      const response = await invitationClient.createInvitation({ email, role });
      return response.invitation;
    },
    onSuccess: () => {
      // Invalidate both lists and seat info
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}

/**
 * Revoke an invitation
 */
export function useRevokeInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await invitationClient.revokeInvitation({ invitationId });
      return response.invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}

/**
 * Resend an invitation email
 */
export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await invitationClient.resendInvitation({ invitationId });
      return response.invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list() });
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert InvitationStatus to display string
 */
export function invitationStatusToString(status: InvitationStatus): string {
  switch (status) {
    case InvitationStatus.PENDING:
      return 'Pending';
    case InvitationStatus.ACCEPTED:
      return 'Accepted';
    case InvitationStatus.EXPIRED:
      return 'Expired';
    case InvitationStatus.REVOKED:
      return 'Revoked';
    default:
      return 'Unknown';
  }
}

/**
 * Convert Role to display string
 */
export function roleToString(role: Role): string {
  switch (role) {
    case Role.OWNER:
      return 'Owner';
    case Role.ADMIN:
      return 'Admin';
    case Role.MEMBER:
      return 'Member';
    default:
      return 'Unknown';
  }
}

/**
 * Get status color classes for badges
 */
export function getInvitationStatusColor(status: InvitationStatus): string {
  switch (status) {
    case InvitationStatus.PENDING:
      return 'bg-yellow-100 text-yellow-700';
    case InvitationStatus.ACCEPTED:
      return 'bg-green-100 text-green-700';
    case InvitationStatus.EXPIRED:
      return 'bg-gray-100 text-gray-700';
    case InvitationStatus.REVOKED:
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}
