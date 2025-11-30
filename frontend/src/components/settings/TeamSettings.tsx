'use client';

import React, { useState } from 'react';
import {
  Users,
  Mail,
  AlertCircle,
  UserPlus,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  X,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  useListInvitations,
  useGetSeatInfo,
  useCreateInvitation,
  useRevokeInvitation,
  useResendInvitation,
  InvitationStatus,
  Role,
  invitationStatusToString,
  roleToString,
  getInvitationStatusColor,
  type Invitation,
} from '@/hooks/useInvitations';

// =============================================================================
// Main Component
// =============================================================================

export default function TeamSettings() {
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Queries
  const { data: seatInfo, isLoading: seatLoading, error: seatError } = useGetSeatInfo();
  const {
    data: invitations,
    isLoading: invitationsLoading,
    error: invitationsError,
  } = useListInvitations();

  const isLoading = seatLoading || invitationsLoading;
  const error = seatError || invitationsError;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load team info</h3>
        <p className="text-gray-600">Please try again later.</p>
      </div>
    );
  }

  const pendingInvitations = invitations?.filter(
    (inv) => inv.status === InvitationStatus.PENDING
  ) || [];
  const hasAvailableSeats = (seatInfo?.availableSeats ?? 0) > 0;

  return (
    <div>
      <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-4 lg:mb-6">
        Team Management
      </h2>

      {/* Seat Info Card */}
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Team Seats</h3>
            <p className="text-gray-600">Manage your team&apos;s seats and invitations</p>
          </div>
          <Users className="w-8 h-8 text-primary-600 flex-shrink-0" />
        </div>

        {seatInfo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SeatStat label="Total Seats" value={seatInfo.totalSeats} />
            <SeatStat label="Used" value={seatInfo.usedSeats} />
            <SeatStat label="Pending" value={seatInfo.pendingInvitations} />
            <SeatStat
              label="Available"
              value={seatInfo.availableSeats}
              highlight={seatInfo.availableSeats > 0}
            />
          </div>
        )}
      </div>

      {/* Invite Button / Form */}
      {!showInviteForm ? (
        <button
          onClick={() => setShowInviteForm(true)}
          disabled={!hasAvailableSeats}
          className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors mb-6 ${
            hasAvailableSeats
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <UserPlus className="w-5 h-5" />
          {hasAvailableSeats ? 'Invite Team Member' : 'No Seats Available'}
        </button>
      ) : (
        <InviteForm
          onClose={() => setShowInviteForm(false)}
          onSuccess={() => setShowInviteForm(false)}
        />
      )}

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">
            Pending Invitations ({pendingInvitations.length})
          </h3>
          <div className="border border-gray-200 rounded-xl">
            {pendingInvitations.map((invitation, idx) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                isFirst={idx === 0}
                isLast={idx === pendingInvitations.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Invitations (non-pending) */}
      {invitations && invitations.length > pendingInvitations.length && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">
            Invitation History
          </h3>
          <div className="border border-gray-200 rounded-xl">
            {invitations
              .filter((inv) => inv.status !== InvitationStatus.PENDING)
              .map((invitation, idx, arr) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  isFirst={idx === 0}
                  isLast={idx === arr.length - 1}
                  showActions={false}
                />
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!invitations || invitations.length === 0) && !showInviteForm && (
        <div className="text-center py-8 border border-dashed border-gray-300 rounded-xl">
          <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="font-medium text-gray-900 mb-1">No invitations yet</h3>
          <p className="text-sm text-gray-500">
            Invite team members to collaborate with you
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub Components
// =============================================================================

interface SeatStatProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function SeatStat({ label, value, highlight }: SeatStatProps) {
  return (
    <div className="text-center">
      <p
        className={`text-2xl font-bold ${
          highlight ? 'text-green-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}

interface InviteFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

function InviteForm({ onClose, onSuccess }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.MEMBER);
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: createInvitation, isPending } = useCreateInvitation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      await createInvitation({ email: email.trim(), role });
      onSuccess();
    } catch (err) {
      if (err instanceof Error) {
        // Check for specific error messages
        const message = err.message.toLowerCase();
        if (message.includes('already invited')) {
          setError('This email has already been invited');
        } else if (message.includes('seat limit')) {
          setError('No seats available. Upgrade your plan to invite more members.');
        } else {
          setError('Failed to send invitation. Please try again.');
        }
      } else {
        setError('Failed to send invitation. Please try again.');
      }
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-5 mb-6 bg-gray-50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Invite Team Member</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base"
            disabled={isPending}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(Number(e.target.value) as Role)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base bg-white"
            disabled={isPending}
          >
            <option value={Role.MEMBER}>Member - Can view and edit content</option>
            <option value={Role.ADMIN}>Admin - Can manage team and settings</option>
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Send Invitation
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

interface InvitationRowProps {
  invitation: Invitation;
  isFirst?: boolean;
  isLast: boolean;
  showActions?: boolean;
}

function InvitationRow({ invitation, isFirst, isLast, showActions = true }: InvitationRowProps) {
  const [showMenu, setShowMenu] = useState(false);

  const { mutateAsync: revokeInvitation, isPending: isRevoking } = useRevokeInvitation();
  const { mutateAsync: resendInvitation, isPending: isResending } = useResendInvitation();

  const handleRevoke = async () => {
    try {
      await revokeInvitation(invitation.id);
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to revoke invitation:', err);
    }
  };

  const handleResend = async () => {
    try {
      await resendInvitation(invitation.id);
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to resend invitation:', err);
    }
  };

  const isPending = invitation.status === InvitationStatus.PENDING;
  const isWorking = isRevoking || isResending;

  // Format expiration date
  const expiresAt = invitation.expiresAt
    ? new Date(Number(invitation.expiresAt.seconds) * 1000)
    : null;
  const isExpiringSoon = expiresAt && expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000;

  const roundedClasses = isFirst && isLast
    ? 'rounded-xl'
    : isFirst
      ? 'rounded-t-xl'
      : isLast
        ? 'rounded-b-xl'
        : '';

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 bg-white ${roundedClasses} ${
        !isLast ? 'border-b border-gray-100' : ''
      }`}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0">
        {invitation.status === InvitationStatus.PENDING && (
          <Clock className="w-5 h-5 text-yellow-500" />
        )}
        {invitation.status === InvitationStatus.ACCEPTED && (
          <CheckCircle className="w-5 h-5 text-green-500" />
        )}
        {(invitation.status === InvitationStatus.EXPIRED ||
          invitation.status === InvitationStatus.REVOKED) && (
          <XCircle className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{invitation.email}</p>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{roleToString(invitation.role)}</span>
          {expiresAt && isPending && (
            <>
              <span className="text-gray-300">|</span>
              <span className={isExpiringSoon ? 'text-orange-600' : ''}>
                Expires {expiresAt.toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${getInvitationStatusColor(
          invitation.status
        )}`}
      >
        {invitationStatusToString(invitation.status)}
      </span>

      {/* Actions Menu */}
      {showActions && isPending && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            disabled={isWorking}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            {isWorking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MoreHorizontal className="w-4 h-4" />
            )}
          </button>

          {showMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />

              {/* Menu */}
              <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                <button
                  onClick={handleResend}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Resend
                </button>
                <button
                  onClick={handleRevoke}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                  Revoke
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
