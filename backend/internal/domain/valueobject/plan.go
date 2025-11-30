package valueobject

import "fmt"

// Plan represents the subscription tier for a company.
type Plan string

const (
	PlanStarter    Plan = "starter"
	PlanPro        Plan = "pro"
	PlanEnterprise Plan = "enterprise"
)

// String returns the string representation of the plan.
func (p Plan) String() string {
	return string(p)
}

// IsValid checks if the plan is a valid value.
func (p Plan) IsValid() bool {
	switch p {
	case PlanStarter, PlanPro, PlanEnterprise:
		return true
	}
	return false
}

// RequiresPayment returns true if this plan requires Stripe checkout.
func (p Plan) RequiresPayment() bool {
	return p == PlanStarter || p == PlanPro
}

// PricePerSeatCents returns the price per seat in cents for this plan.
func (p Plan) PricePerSeatCents() int {
	switch p {
	case PlanStarter:
		return 800 // $8.00
	case PlanPro:
		return 1200 // $12.00
	default:
		return 0
	}
}

// DefaultSeatLimit returns the default seat limit for this plan.
// Note: Actual seat limit may be higher based on subscription quantity.
func (p Plan) DefaultSeatLimit() int {
	switch p {
	case PlanStarter:
		return 5
	case PlanPro:
		return 50
	case PlanEnterprise:
		return 999 // Effectively unlimited
	default:
		return 0
	}
}

// ParsePlan converts a string to a Plan, returning an error if invalid.
func ParsePlan(s string) (Plan, error) {
	p := Plan(s)
	if !p.IsValid() {
		return "", fmt.Errorf("invalid plan: %s", s)
	}
	return p, nil
}

// AllPlans returns all valid plan values.
func AllPlans() []Plan {
	return []Plan{PlanStarter, PlanPro, PlanEnterprise}
}
