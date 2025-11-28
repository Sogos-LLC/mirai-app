package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/config"
	"github.com/sogos/mirai-backend/internal/models"
	"github.com/sogos/mirai-backend/internal/repository"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
)

func init() {
	// Stripe key will be set by config when handlers are initialized
}

// AuthHandler handles authentication-related requests
type AuthHandler struct {
	userRepo    *repository.UserRepository
	companyRepo *repository.CompanyRepository
	config      *config.Config
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(userRepo *repository.UserRepository, companyRepo *repository.CompanyRepository, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		userRepo:    userRepo,
		companyRepo: companyRepo,
		config:      cfg,
	}
}

// KratosIdentity represents a Kratos identity
type KratosIdentity struct {
	ID     string `json:"id"`
	Traits struct {
		Email string `json:"email"`
		Name  struct {
			First string `json:"first"`
			Last  string `json:"last"`
		} `json:"name"`
	} `json:"traits"`
}

// KratosSession represents a Kratos session
type KratosSession struct {
	ID       string `json:"id"`
	Token    string `json:"session_token"`
	Identity struct {
		ID string `json:"id"`
	} `json:"identity"`
}

// CheckEmail handles GET /api/v1/auth/check-email
// Checks if an email is already registered
func (h *AuthHandler) CheckEmail(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email is required"})
		return
	}

	// Check if identity exists in Kratos
	exists, err := h.checkEmailExists(email)
	if err != nil {
		log.Printf("Failed to check email: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check email"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"exists": exists})
}

// checkEmailExists checks if an email is already registered in Kratos
func (h *AuthHandler) checkEmailExists(email string) (bool, error) {
	// Query Kratos Admin API for identities with this email
	url := fmt.Sprintf("%s/admin/identities?credentials_identifier=%s", h.config.KratosAdminURL, email)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil // Assume not found on error
	}

	var identities []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&identities); err != nil {
		return false, err
	}

	return len(identities) > 0, nil
}

// Register handles POST /api/v1/auth/register
// Creates a new user identity in Kratos, company, and user record atomically
func (h *AuthHandler) Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Step 1: Create identity in Kratos via Admin API
	kratosIdentity, err := h.createKratosIdentity(req)
	if err != nil {
		log.Printf("Failed to create Kratos identity: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	kratosID, err := uuid.Parse(kratosIdentity.ID)
	if err != nil {
		log.Printf("Failed to parse Kratos ID: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid identity ID from Kratos"})
		return
	}

	// Step 2: Create company
	var industry, teamSize *string
	if req.Industry != "" {
		industry = &req.Industry
	}
	if req.TeamSize != "" {
		teamSize = &req.TeamSize
	}

	company := &models.Company{
		Name:     req.CompanyName,
		Industry: industry,
		TeamSize: teamSize,
		Plan:     req.Plan,
	}
	if err := h.companyRepo.Create(company); err != nil {
		log.Printf("Failed to create company: %v", err)
		// TODO: Consider rolling back Kratos identity on failure
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create company"})
		return
	}

	// Step 3: Create user as owner
	user := &models.User{
		KratosID:  kratosID,
		CompanyID: &company.ID,
		Role:      "owner",
	}
	if err := h.userRepo.Create(user); err != nil {
		log.Printf("Failed to create user: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	response := models.RegisterResponse{
		User:    *user,
		Company: company,
	}

	// Step 4: For non-enterprise plans, create Stripe checkout session
	// User will be logged in via recovery link after checkout completes
	if req.Plan != "enterprise" {
		checkoutURL, err := h.createCheckoutSession(company, req.Email, req.Plan, req.SeatCount)
		if err != nil {
			log.Printf("Failed to create checkout session: %v", err)
			// Don't fail registration - just log and continue
		} else {
			response.CheckoutURL = checkoutURL
		}
	}

	c.JSON(http.StatusCreated, response)
}

// createKratosIdentity creates a new identity in Kratos via Admin API
func (h *AuthHandler) createKratosIdentity(req models.RegisterRequest) (*KratosIdentity, error) {
	// Build the identity creation payload
	payload := map[string]interface{}{
		"schema_id": "user",
		"traits": map[string]interface{}{
			"email": req.Email,
			"name": map[string]string{
				"first": req.FirstName,
				"last":  req.LastName,
			},
		},
		"credentials": map[string]interface{}{
			"password": map[string]interface{}{
				"config": map[string]string{
					"password": req.Password,
				},
			},
		},
		"state": "active",
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// POST to Kratos Admin API
	url := fmt.Sprintf("%s/admin/identities", h.config.KratosAdminURL)
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to call Kratos: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		// Parse error response
		var errorResp struct {
			Error struct {
				Message string `json:"message"`
				Code    int    `json:"code"`
			} `json:"error"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(body, &errorResp); err == nil {
			errMsg := errorResp.Error.Message
			if errMsg == "" {
				errMsg = errorResp.Message
			}
			// Check for conflict (duplicate email)
			if resp.StatusCode == http.StatusConflict || errorResp.Error.Code == 409 {
				return nil, fmt.Errorf("An account with this email already exists. Please sign in instead.")
			}
			if errMsg != "" {
				return nil, fmt.Errorf("%s", errMsg)
			}
		}
		return nil, fmt.Errorf("Kratos returned status %d: %s", resp.StatusCode, string(body))
	}

	var identity KratosIdentity
	if err := json.Unmarshal(body, &identity); err != nil {
		return nil, fmt.Errorf("failed to parse Kratos response: %w", err)
	}

	return &identity, nil
}

// createRecoveryLink creates a recovery link for an identity via Admin API
// This is used to log users in after registration since direct session creation is not supported
func (h *AuthHandler) createRecoveryLink(identityID string) (string, error) {
	payload := map[string]interface{}{
		"identity_id": identityID,
		"expires_in":  "1h",
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payload: %w", err)
	}

	url := fmt.Sprintf("%s/admin/recovery/link", h.config.KratosAdminURL)
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("failed to call Kratos: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("Kratos returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		RecoveryLink string `json:"recovery_link"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse Kratos response: %w", err)
	}

	return result.RecoveryLink, nil
}

// CompleteCheckout handles GET /api/v1/auth/complete-checkout
// Called after Stripe checkout to log the user in via recovery link
func (h *AuthHandler) CompleteCheckout(c *gin.Context) {
	sessionID := c.Query("session_id")
	if sessionID == "" {
		log.Printf("CompleteCheckout: missing session_id")
		c.Redirect(http.StatusFound, h.config.FrontendURL+"/auth/login?error=missing_session")
		return
	}

	// Fetch checkout session from Stripe
	sess, err := session.Get(sessionID, nil)
	if err != nil {
		log.Printf("CompleteCheckout: failed to get Stripe session: %v", err)
		c.Redirect(http.StatusFound, h.config.FrontendURL+"/auth/login?error=invalid_session")
		return
	}

	// Get company ID from metadata
	companyIDStr, ok := sess.Metadata["company_id"]
	if !ok {
		log.Printf("CompleteCheckout: no company_id in session metadata")
		c.Redirect(http.StatusFound, h.config.FrontendURL+"/auth/login?error=invalid_session")
		return
	}

	companyID, err := uuid.Parse(companyIDStr)
	if err != nil {
		log.Printf("CompleteCheckout: invalid company_id: %v", err)
		c.Redirect(http.StatusFound, h.config.FrontendURL+"/auth/login?error=invalid_session")
		return
	}

	// Find the owner of this company
	user, err := h.userRepo.GetOwnerByCompanyID(companyID)
	if err != nil || user == nil {
		log.Printf("CompleteCheckout: failed to find company owner: %v", err)
		c.Redirect(http.StatusFound, h.config.FrontendURL+"/auth/login?error=user_not_found")
		return
	}

	// Create a recovery link for the user
	recoveryLink, err := h.createRecoveryLink(user.KratosID.String())
	if err != nil {
		log.Printf("CompleteCheckout: failed to create recovery link: %v", err)
		// Fall back to login page
		c.Redirect(http.StatusFound, h.config.FrontendURL+"/auth/login?checkout=success")
		return
	}

	log.Printf("CompleteCheckout: redirecting user %s to recovery link", user.ID)
	c.Redirect(http.StatusFound, recoveryLink)
}

// createCheckoutSession creates a Stripe checkout session for the new company
func (h *AuthHandler) createCheckoutSession(company *models.Company, email string, plan string, seatCount int) (string, error) {
	// Determine price ID based on plan
	var priceID string
	switch plan {
	case "starter":
		priceID = h.config.StripeStarterPriceID
	case "pro":
		priceID = h.config.StripeProPriceID
	default:
		return "", nil // Enterprise doesn't use checkout
	}

	if priceID == "" {
		log.Printf("No price ID configured for plan: %s", plan)
		return "", nil
	}

	// Use minimum 1 seat
	if seatCount < 1 {
		seatCount = 1
	}

	// Create Stripe customer
	customerParams := &stripe.CustomerParams{
		Email: stripe.String(email),
		Name:  stripe.String(company.Name),
		Metadata: map[string]string{
			"company_id": company.ID.String(),
		},
	}
	newCustomer, err := customer.New(customerParams)
	if err != nil {
		return "", err
	}

	// Save customer ID to company
	if err := h.companyRepo.UpdateStripeFields(company.ID, &newCustomer.ID, nil, company.SubscriptionStatus, company.Plan); err != nil {
		log.Printf("Failed to save stripe customer ID: %v", err)
	}

	// Create checkout session
	// Success URL points to our backend which creates a recovery link to log the user in
	// {CHECKOUT_SESSION_ID} is replaced by Stripe with the actual session ID
	successURL := h.config.BackendURL + "/api/v1/auth/complete-checkout?session_id={CHECKOUT_SESSION_ID}"

	checkoutParams := &stripe.CheckoutSessionParams{
		Customer: stripe.String(newCustomer.ID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(int64(seatCount)),
			},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(h.config.FrontendURL + "/auth/registration?checkout=canceled"),
		Metadata: map[string]string{
			"company_id": company.ID.String(),
			"plan":       plan,
		},
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
			Metadata: map[string]string{
				"company_id": company.ID.String(),
				"plan":       plan,
			},
		},
	}

	sess, err := session.New(checkoutParams)
	if err != nil {
		return "", err
	}

	return sess.URL, nil
}
