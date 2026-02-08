package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// KnowledgeGapService handles knowledge gap task business logic.
type KnowledgeGapService struct {
	gapTaskRepo         repository.KnowledgeGapTaskRepository
	userRepo            repository.UserRepository
	notificationService *NotificationService
	identity            service.IdentityProvider
	logger              service.Logger
}

// NewKnowledgeGapService creates a new knowledge gap service.
func NewKnowledgeGapService(
	gapTaskRepo repository.KnowledgeGapTaskRepository,
	userRepo repository.UserRepository,
	notificationService *NotificationService,
	identity service.IdentityProvider,
	logger service.Logger,
) *KnowledgeGapService {
	return &KnowledgeGapService{
		gapTaskRepo:         gapTaskRepo,
		userRepo:            userRepo,
		notificationService: notificationService,
		identity:            identity,
		logger:              logger,
	}
}

// CreateGapTaskInput represents a single gap task to create.
type CreateGapTaskInput struct {
	GapDescription   string
	AssignedToUserID uuid.UUID
}

// CreateGapTasks bulk creates gap tasks for a course and notifies assignees.
func (s *KnowledgeGapService) CreateGapTasks(
	ctx context.Context,
	kratosID uuid.UUID,
	courseID uuid.UUID,
	targetTeamID uuid.UUID,
	inputs []CreateGapTaskInput,
) ([]*entity.KnowledgeGapTask, error) {
	log := s.logger.With("courseID", courseID, "taskCount", len(inputs))

	// Resolve current user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	tasks := make([]*entity.KnowledgeGapTask, 0, len(inputs))
	for _, input := range inputs {
		task := &entity.KnowledgeGapTask{
			TenantID:         *user.TenantID,
			CourseID:         courseID,
			GapDescription:   input.GapDescription,
			AssignedToUserID: input.AssignedToUserID,
			AssignedByUserID: user.ID,
			TargetTeamID:     &targetTeamID,
		}

		if err := s.gapTaskRepo.Create(ctx, task); err != nil {
			log.Error("failed to create gap task", "error", err)
			return nil, domainerrors.ErrInternal.WithCause(err)
		}

		tasks = append(tasks, task)

		// Notify assignee
		actionURL := "/dashboard?tab=tasks"
		if _, err := s.notificationService.CreateNotification(ctx, CreateNotificationRequest{
			UserID:    input.AssignedToUserID,
			Type:      valueobject.NotificationTypeGapTaskAssigned,
			Priority:  valueobject.NotificationPriorityNormal,
			Title:     "Knowledge gap task assigned",
			Message:   fmt.Sprintf("You've been assigned to fill a knowledge gap: %s", input.GapDescription),
			ActionURL: &actionURL,
			CourseID:  &courseID,
		}); err != nil {
			log.Warn("failed to send gap task notification", "assignee", input.AssignedToUserID, "error", err)
		}
	}

	log.Info("created gap tasks", "count", len(tasks))
	return tasks, nil
}

// ListForUser retrieves gap tasks assigned to a user.
func (s *KnowledgeGapService) ListForUser(ctx context.Context, kratosID uuid.UUID, status *string) ([]*entity.KnowledgeGapTask, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	tasks, err := s.gapTaskRepo.ListByUser(ctx, user.ID, status)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Enrich with assignee names from Kratos
	s.enrichTasksWithIdentity(ctx, tasks)
	return tasks, nil
}

// ListForCourse retrieves gap tasks for a course.
func (s *KnowledgeGapService) ListForCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeGapTask, error) {
	tasks, err := s.gapTaskRepo.ListByCourse(ctx, courseID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Enrich with assignee names from Kratos
	s.enrichTasksWithIdentity(ctx, tasks)
	return tasks, nil
}

// CompleteTask marks a gap task as completed and notifies the assigner.
func (s *KnowledgeGapService) CompleteTask(ctx context.Context, kratosID uuid.UUID, taskID uuid.UUID, knowledgeSourceID *uuid.UUID) (*entity.KnowledgeGapTask, error) {
	log := s.logger.With("taskID", taskID)

	// Verify the user is the assignee
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	existing, err := s.gapTaskRepo.GetByID(ctx, taskID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if existing == nil {
		return nil, domainerrors.ErrNotFound
	}
	if existing.AssignedToUserID != user.ID {
		return nil, domainerrors.ErrForbidden
	}

	task, err := s.gapTaskRepo.Complete(ctx, taskID, knowledgeSourceID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Notify the assigner that the gap has been filled
	actionURL := fmt.Sprintf("/course/wizard?courseId=%s", task.CourseID.String())
	if _, err := s.notificationService.CreateNotification(ctx, CreateNotificationRequest{
		UserID:    task.AssignedByUserID,
		Type:      valueobject.NotificationTypeGapTaskCompleted,
		Priority:  valueobject.NotificationPriorityNormal,
		Title:     "Knowledge gap filled",
		Message:   fmt.Sprintf("A knowledge gap has been filled: %s", task.GapDescription),
		ActionURL: &actionURL,
		CourseID:  &task.CourseID,
	}); err != nil {
		log.Warn("failed to send gap completion notification", "assigner", task.AssignedByUserID, "error", err)
	}

	log.Info("gap task completed", "taskID", taskID)
	return task, nil
}

// enrichTasksWithIdentity adds names/emails from Kratos to gap tasks.
func (s *KnowledgeGapService) enrichTasksWithIdentity(ctx context.Context, tasks []*entity.KnowledgeGapTask) {
	// Collect unique user IDs to avoid redundant Kratos lookups
	userCache := make(map[uuid.UUID]*entity.User)

	for _, task := range tasks {
		user, ok := userCache[task.AssignedToUserID]
		if !ok {
			var err error
			user, err = s.userRepo.GetByID(ctx, task.AssignedToUserID)
			if err != nil || user == nil {
				continue
			}
			userCache[task.AssignedToUserID] = user
		}

		identity, err := s.identity.GetIdentity(ctx, user.KratosID.String())
		if err != nil || identity == nil {
			continue
		}
		task.AssignedToName = identity.FirstName + " " + identity.LastName
		task.AssignedToEmail = identity.Email
	}
}
