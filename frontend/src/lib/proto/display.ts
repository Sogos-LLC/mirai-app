/**
 * Proto Display Converters
 *
 * Convert proto enums to human-readable display strings for UI rendering.
 * This is the ONLY place where enum-to-string conversion happens.
 *
 * These functions are for UI display only - not for API communication.
 * Proto enums should flow through the system unchanged.
 */

import {
  Plan,
  Role,
  TeamRole,
  SubscriptionStatus,
} from '@/gen/mirai/v1/common_pb';

/**
 * Convert Plan enum to display string
 */
export function planToDisplayString(plan: Plan): string {
  const map: Record<Plan, string> = {
    [Plan.UNSPECIFIED]: 'None',
    [Plan.STARTER]: 'Starter',
    [Plan.PRO]: 'Pro',
    [Plan.ENTERPRISE]: 'Enterprise',
  };
  return map[plan] ?? 'Unknown';
}

/**
 * Convert Role enum to display string
 */
export function roleToDisplayString(role: Role): string {
  const map: Record<Role, string> = {
    [Role.UNSPECIFIED]: 'Unknown',
    [Role.OWNER]: 'Owner',
    [Role.ADMIN]: 'Admin',
    [Role.MEMBER]: 'Member',
  };
  return map[role] ?? 'Unknown';
}

/**
 * Convert TeamRole enum to display string
 */
export function teamRoleToDisplayString(role: TeamRole): string {
  const map: Record<TeamRole, string> = {
    [TeamRole.UNSPECIFIED]: 'Unknown',
    [TeamRole.LEAD]: 'Lead',
    [TeamRole.MEMBER]: 'Member',
  };
  return map[role] ?? 'Unknown';
}

/**
 * Convert SubscriptionStatus enum to display string
 */
export function subscriptionStatusToDisplayString(
  status: SubscriptionStatus
): string {
  const map: Record<SubscriptionStatus, string> = {
    [SubscriptionStatus.UNSPECIFIED]: 'None',
    [SubscriptionStatus.NONE]: 'None',
    [SubscriptionStatus.ACTIVE]: 'Active',
    [SubscriptionStatus.PAST_DUE]: 'Past Due',
    [SubscriptionStatus.CANCELED]: 'Canceled',
  };
  return map[status] ?? 'Unknown';
}
