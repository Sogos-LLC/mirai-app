package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sogos/mirai-backend/internal/middleware"
	"github.com/sogos/mirai-backend/internal/models"
	"github.com/sogos/mirai-backend/internal/repository"
)

// UserHandler handles user-related requests
type UserHandler struct {
	userRepo    *repository.UserRepository
	companyRepo *repository.CompanyRepository
}

// NewUserHandler creates a new user handler
func NewUserHandler(userRepo *repository.UserRepository, companyRepo *repository.CompanyRepository) *UserHandler {
	return &UserHandler{
		userRepo:    userRepo,
		companyRepo: companyRepo,
	}
}

// GetMe handles GET /api/v1/me
func (h *UserHandler) GetMe(c *gin.Context) {
	kratosID, err := middleware.GetKratosID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.userRepo.GetByKratosID(kratosID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
		return
	}

	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	response := models.UserWithCompany{
		User: *user,
	}

	// Get company if user belongs to one
	if user.CompanyID != nil {
		company, err := h.companyRepo.GetByID(*user.CompanyID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get company"})
			return
		}
		response.Company = company
	}

	c.JSON(http.StatusOK, response)
}

// Onboard handles POST /api/v1/onboard
func (h *UserHandler) Onboard(c *gin.Context) {
	kratosID, err := middleware.GetKratosID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Check if user already exists
	existingUser, err := h.userRepo.GetByKratosID(kratosID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check user"})
		return
	}
	if existingUser != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user already onboarded"})
		return
	}

	// Parse request body
	var req models.OnboardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create company
	company := &models.Company{
		Name: req.CompanyName,
		Plan: req.Plan,
	}
	if err := h.companyRepo.Create(company); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create company"})
		return
	}

	// Create user as owner
	user := &models.User{
		KratosID:  kratosID,
		CompanyID: &company.ID,
		Role:      "owner",
	}
	if err := h.userRepo.Create(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, models.UserWithCompany{
		User:    *user,
		Company: company,
	})
}
