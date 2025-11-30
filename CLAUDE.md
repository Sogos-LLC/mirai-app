- State Machine Best Practices for Mirai

Consistency Across Flows: Use state machines uniformly across flows (registration, login, invite, seat assignment) to ensure shared transitions, error handling, telemetry, and side-effect orchestration are predictable and centralized.

Single Source of Truth: Centralize guards, transitions, and shared context values (e.g. session token, user role, tenant metadata) in typed context models. Avoid ad hoc state tracking via React useState.

Isolate Side Effects: Use invoke and onDone/onError handlers for all async operations (e.g. Kratos flows, Stripe redirection, token setting). Do not embed side effects directly in transitions.

Event-Driven Architecture: Prefer message-based transitions (type: 'CHECKOUT_SUCCESS', type: 'SESSION_CREATED') rather than hardcoded boolean flags. Enables better logging and testability.

Error States Must Be Explicit: Every failure path (network, validation, auth errors) must land in a distinct state (error.kratos, error.stripe, error.session) with retry paths or recovery transitions.

Redirects as Transitions: Track navigation like /dashboard, /auth/login inside machine logic. Avoid navigation logic in components when the state machine owns the flow.

Telemetry Hooks: Emit analytics events (FLOW_STARTED, FLOW_FAILED, SESSION_ESTABLISHED) from specific state transitions, not ad hoc in the UI.

Testability: Export state machines separately from components. Cover all transitions and side effects in unit tests using @xstate/test.