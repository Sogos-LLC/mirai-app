/**
 * Ory Kratos TypeScript types
 */

export interface KratosIdentity {
  id: string;
  schema_id: string;
  schema_url: string;
  state: 'active' | 'inactive';
  traits: {
    email: string;
    name: {
      first: string;
      last: string;
    };
    company: {
      name: string;
      role: 'owner' | 'admin' | 'member';
    };
  };
  verifiable_addresses?: Array<{
    id: string;
    value: string;
    verified: boolean;
    via: string;
    status: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface KratosSession {
  id: string;
  active: boolean;
  expires_at: string;
  authenticated_at: string;
  authenticator_assurance_level: string;
  authentication_methods: Array<{
    method: string;
    aal: string;
    completed_at: string;
  }>;
  issued_at: string;
  identity: KratosIdentity;
}

export interface KratosError {
  id: string;
  error: {
    code: number;
    status: string;
    reason: string;
    message: string;
  };
  created_at: string;
  updated_at: string;
}

export interface UiNode {
  type: 'input' | 'text' | 'img' | 'a' | 'script';
  group: 'default' | 'password' | 'oidc' | 'profile' | 'link' | 'code';
  attributes: UiNodeAttributes;
  messages: UiText[];
  meta: {
    label?: UiText;
  };
}

export interface UiNodeAttributes {
  name?: string;
  type?: string;
  value?: string | number | boolean;
  required?: boolean;
  disabled?: boolean;
  node_type?: string;
  onclick?: string;
  pattern?: string;
  title?: string;
  src?: string;
  href?: string;
  id?: string;
}

export interface UiText {
  id: number;
  text: string;
  type: 'info' | 'error' | 'success';
  context?: Record<string, unknown>;
}

export interface UiContainer {
  action: string;
  method: string;
  nodes: UiNode[];
  messages?: UiText[];
}

export interface LoginFlow {
  id: string;
  type: 'browser' | 'api';
  expires_at: string;
  issued_at: string;
  request_url: string;
  ui: UiContainer;
  created_at: string;
  updated_at: string;
  refresh?: boolean;
  requested_aal?: string;
}

export interface RegistrationFlow {
  id: string;
  type: 'browser' | 'api';
  expires_at: string;
  issued_at: string;
  request_url: string;
  ui: UiContainer;
  created_at: string;
  updated_at: string;
}

export interface RecoveryFlow {
  id: string;
  type: 'browser' | 'api';
  expires_at: string;
  issued_at: string;
  request_url: string;
  ui: UiContainer;
  state: 'choose_method' | 'sent_email' | 'passed_challenge';
  created_at: string;
  updated_at: string;
}

export interface VerificationFlow {
  id: string;
  type: 'browser' | 'api';
  expires_at: string;
  issued_at: string;
  request_url: string;
  ui: UiContainer;
  state: 'choose_method' | 'sent_email' | 'passed_challenge';
  created_at: string;
  updated_at: string;
}

export interface SettingsFlow {
  id: string;
  type: 'browser' | 'api';
  expires_at: string;
  issued_at: string;
  request_url: string;
  ui: UiContainer;
  state: 'show_form' | 'success';
  identity: KratosIdentity;
  created_at: string;
  updated_at: string;
}

export interface LogoutFlow {
  logout_url: string;
  logout_token: string;
}
