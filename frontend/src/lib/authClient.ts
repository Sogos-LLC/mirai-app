import { createClient } from '@connectrpc/connect';
import { AuthService } from '@/gen/mirai/v1/auth_pb';
import { transport } from './connect';
import { Plan } from '@/gen/mirai/v1/common_pb';
import { create } from '@bufbuild/protobuf';
import {
  CheckEmailRequestSchema,
  RegisterRequestSchema,
  EnterpriseContactRequestSchema,
} from '@/gen/mirai/v1/auth_pb';

// Create the auth client
const authClient = createClient(AuthService, transport);

// Check if email already exists
export async function checkEmail(email: string): Promise<{ exists: boolean }> {
  const request = create(CheckEmailRequestSchema, { email });
  const response = await authClient.checkEmail(request);
  return { exists: response.exists };
}

// Register a new user
export async function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
  industry?: string;
  teamSize?: string;
  plan: Plan;
  seatCount: number;
}): Promise<{
  user: { id: string };
  company?: { id: string };
  checkout_url?: string;
  session_token?: string;
}> {
  const request = create(RegisterRequestSchema, {
    email: data.email,
    password: data.password,
    firstName: data.firstName,
    lastName: data.lastName,
    companyName: data.companyName,
    industry: data.industry,
    teamSize: data.teamSize,
    plan: data.plan,
    seatCount: data.seatCount,
  });

  const response = await authClient.register(request);

  return {
    user: { id: response.user?.id || '' },
    company: response.company ? { id: response.company.id } : undefined,
    checkout_url: response.checkoutUrl || undefined,
    session_token: response.sessionToken || undefined,
  };
}

// Submit enterprise contact request
export async function submitEnterpriseContact(data: {
  companyName: string;
  industry?: string;
  teamSize?: string;
  name: string;
  email: string;
}): Promise<{ success: boolean }> {
  const request = create(EnterpriseContactRequestSchema, {
    companyName: data.companyName,
    industry: data.industry,
    teamSize: data.teamSize,
    name: data.name,
    email: data.email,
  });

  await authClient.enterpriseContact(request);
  return { success: true };
}
