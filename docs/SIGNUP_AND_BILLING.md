# Signup Wizard & Stripe Billing Integration

## Overview

Multi-step signup wizard that collects user information, creates accounts via Kratos, and processes payments through Stripe Checkout.

## Signup Flow

1. **Email Step** - Validates email, checks if already registered
2. **Organization Step** - Company name, industry, team size
3. **Account Step** - First/last name, password with confirmation
4. **Plan Step** - Select starter/pro/enterprise, seat count

## Architecture

```
Frontend (SignupWizard)
    |
    v
Backend API (POST /api/v1/auth/register)
    |
    ├── Creates Kratos identity via Admin API
    ├── Creates company record
    ├── Creates user record (owner role)
    └── Creates Stripe checkout session
            |
            v
        Stripe Checkout
            |
            v
Backend (GET /api/v1/auth/complete-checkout)
    |
    ├── Fetches checkout session from Stripe
    ├── Creates Kratos recovery link for auto-login
    └── Redirects to recovery link
            |
            v
        Kratos (creates session)
            |
            v
        Dashboard (with confetti)
```

## Key Components

### Backend

- `handlers/auth.go` - Registration, email check, checkout completion
- `handlers/billing.go` - Stripe webhooks, checkout sessions, billing portal
- `handlers/contact.go` - Enterprise contact form

### Frontend

- `components/auth/signup/SignupWizard.tsx` - Main wizard orchestrator
- `components/auth/signup/*Step.tsx` - Individual step components
- `middleware.ts` - Handles post-checkout redirect via cookie

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/auth/check-email` | Check if email exists |
| POST | `/api/v1/auth/register` | Create account + start checkout |
| GET | `/api/v1/auth/complete-checkout` | Auto-login after Stripe payment |
| POST | `/api/v1/billing/webhook` | Stripe webhook handler |
| POST | `/api/v1/billing/checkout` | Create checkout session (existing users) |
| POST | `/api/v1/billing/portal` | Stripe billing portal |

## Local Development

### Prerequisites

- Stripe CLI installed
- Stripe test API keys in `local-dev/.env`

### Running Stripe Webhook Listener

In a separate terminal, run:

```bash
stripe listen --forward-to localhost:8080/api/v1/billing/webhook
```

Copy the webhook signing secret to your `.env` file as `STRIPE_WEBHOOK_SECRET`.

### Environment Variables

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
KRATOS_ADMIN_URL=http://localhost:4434
```

## Production

### Secrets Management

The `mirai-stripe-secret` is managed manually (gitignored):

```bash
kubectl apply -f k8s/backend/stripe-secret.yaml -n mirai
```

### Stripe Webhook Configuration

Configure webhook endpoint in Stripe Dashboard:
- URL: `https://your-api-domain/api/v1/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.*`

## Database Schema

```sql
companies (
  id, name, industry, team_size, plan,
  stripe_customer_id, stripe_subscription_id, subscription_status
)

users (
  id, kratos_id, company_id, role
)
```

## Post-Checkout Auto-Login

Since Kratos doesn't support direct session creation via Admin API, we use the recovery link flow:

1. Frontend sets `pending_checkout_login` cookie before Stripe redirect
2. After payment, Stripe redirects to `/api/v1/auth/complete-checkout`
3. Backend creates Kratos recovery link and redirects user
4. Kratos creates session, redirects to settings page
5. Middleware detects cookie, redirects to `/dashboard?checkout=success`
6. Dashboard shows confetti and success banner
