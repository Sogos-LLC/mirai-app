package connect

import (
	"context"

	"connectrpc.com/connect"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// CurriculumServiceServer implements the CurriculumService Connect-RPC service.
type CurriculumServiceServer struct {
	miraiv1connect.UnimplementedCurriculumServiceHandler
	curriculumService *service.CurriculumService
}

// NewCurriculumServiceServer creates a new curriculum service server.
func NewCurriculumServiceServer(curriculumService *service.CurriculumService) *CurriculumServiceServer {
	return &CurriculumServiceServer{
		curriculumService: curriculumService,
	}
}

// GetCurriculumMap retrieves the curriculum map for a course.
func (s *CurriculumServiceServer) GetCurriculumMap(
	ctx context.Context,
	req *connect.Request[v1.GetCurriculumMapRequest],
) (*connect.Response[v1.GetCurriculumMapResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	currMap, err := s.curriculumService.GetCurriculumMap(ctx, kratosID, courseID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&v1.GetCurriculumMapResponse{
		CurriculumMap: s3CurriculumMapToProto(currMap),
	}), nil
}

// GenerateCurriculumMap generates or regenerates the curriculum map.
func (s *CurriculumServiceServer) GenerateCurriculumMap(
	ctx context.Context,
	req *connect.Request[v1.GenerateCurriculumMapRequest],
) (*connect.Response[v1.GenerateCurriculumMapResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	currMap, err := s.curriculumService.GenerateCurriculumMap(ctx, kratosID, courseID, req.Msg.ForceRegenerate)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&v1.GenerateCurriculumMapResponse{
		CurriculumMap: s3CurriculumMapToProto(currMap),
	}), nil
}

// ApproveCurriculumMap approves the curriculum map.
func (s *CurriculumServiceServer) ApproveCurriculumMap(
	ctx context.Context,
	req *connect.Request[v1.ApproveCurriculumMapRequest],
) (*connect.Response[v1.ApproveCurriculumMapResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	currMap, err := s.curriculumService.ApproveCurriculumMap(ctx, kratosID, courseID, req.Msg.AcknowledgeWarnings)
	if err != nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition, err)
	}

	return connect.NewResponse(&v1.ApproveCurriculumMapResponse{
		CurriculumMap: s3CurriculumMapToProto(currMap),
	}), nil
}

// UpdateCoverageCell updates a specific coverage cell.
func (s *CurriculumServiceServer) UpdateCoverageCell(
	ctx context.Context,
	req *connect.Request[v1.UpdateCoverageCellRequest],
) (*connect.Response[v1.UpdateCoverageCellResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	intentStr := coverageIntentToString(req.Msg.Intent)
	levelStr := coverageLevelToString(req.Msg.Level)

	currMap, err := s.curriculumService.UpdateCoverageCell(
		ctx,
		kratosID,
		courseID,
		req.Msg.SectionId,
		req.Msg.OutcomeId,
		intentStr,
		levelStr,
		req.Msg.Emphasis,
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&v1.UpdateCoverageCellResponse{
		CurriculumMap: s3CurriculumMapToProto(currMap),
	}), nil
}

// s3CurriculumMapToProto converts S3CurriculumMap to proto.
func s3CurriculumMapToProto(s3Map *service.S3CurriculumMap) *v1.CurriculumMap {
	if s3Map == nil {
		return nil
	}

	rows := make([]*v1.CoverageRow, len(s3Map.Rows))
	for i, row := range s3Map.Rows {
		cells := make([]*v1.CoverageCell, len(row.Cells))
		for j, cell := range row.Cells {
			cells[j] = &v1.CoverageCell{
				OutcomeId:   cell.OutcomeID,
				OutcomeText: cell.OutcomeText,
				Intent:      stringToCoverageIntent(cell.Intent),
				Level:       stringToCoverageLevel(cell.Level),
				Emphasis:    cell.Emphasis,
				LessonIds:   cell.LessonIDs,
				Confidence:  cell.Confidence,
			}
		}
		rows[i] = &v1.CoverageRow{
			SectionId:    row.SectionID,
			SectionTitle: row.SectionTitle,
			SectionOrder: row.SectionOrder,
			Cells:        cells,
		}
	}

	issues := make([]*v1.CurriculumValidationIssue, len(s3Map.Issues))
	for i, issue := range s3Map.Issues {
		issues[i] = &v1.CurriculumValidationIssue{
			Rule:      issue.Rule,
			Severity:  stringToIssueSeverity(issue.Severity),
			Message:   issue.Message,
			OutcomeId: issue.OutcomeID,
			SectionId: issue.SectionID,
		}
	}

	protoMap := &v1.CurriculumMap{
		Id:                      s3Map.ID,
		OutlineVersionHash:      s3Map.OutlineVersionHash,
		Rows:                    rows,
		Issues:                  issues,
		Status:                  stringToCurriculumMapStatus(s3Map.Status),
		GeneratedAt:             timestamppb.New(s3Map.GeneratedAt),
		AggregateGroundingScore: s3Map.AggregateGroundingScore,
		TotalSourceCount:        s3Map.TotalSourceCount,
	}

	if s3Map.ApprovedAt != nil {
		protoMap.ApprovedAt = timestamppb.New(*s3Map.ApprovedAt)
	}
	if s3Map.ApprovedByUserID != nil {
		protoMap.ApprovedByUserId = s3Map.ApprovedByUserID
	}

	return protoMap
}

// Helper conversion functions

func stringToCurriculumMapStatus(s string) v1.CurriculumMapStatus {
	switch s {
	case "pending":
		return v1.CurriculumMapStatus_CURRICULUM_MAP_STATUS_PENDING
	case "valid":
		return v1.CurriculumMapStatus_CURRICULUM_MAP_STATUS_VALID
	case "warnings":
		return v1.CurriculumMapStatus_CURRICULUM_MAP_STATUS_WARNINGS
	case "approved":
		return v1.CurriculumMapStatus_CURRICULUM_MAP_STATUS_APPROVED
	case "stale":
		return v1.CurriculumMapStatus_CURRICULUM_MAP_STATUS_STALE
	default:
		return v1.CurriculumMapStatus_CURRICULUM_MAP_STATUS_UNSPECIFIED
	}
}

func stringToCoverageIntent(s string) v1.CoverageIntent {
	switch s {
	case "teach":
		return v1.CoverageIntent_COVERAGE_INTENT_TEACH
	case "assess":
		return v1.CoverageIntent_COVERAGE_INTENT_ASSESS
	case "reinforce":
		return v1.CoverageIntent_COVERAGE_INTENT_REINFORCE
	default:
		return v1.CoverageIntent_COVERAGE_INTENT_UNSPECIFIED
	}
}

func stringToCoverageLevel(s string) v1.CoverageLevel {
	switch s {
	case "introduce":
		return v1.CoverageLevel_COVERAGE_LEVEL_INTRODUCE
	case "develop":
		return v1.CoverageLevel_COVERAGE_LEVEL_DEVELOP
	case "master":
		return v1.CoverageLevel_COVERAGE_LEVEL_MASTER
	default:
		return v1.CoverageLevel_COVERAGE_LEVEL_UNSPECIFIED
	}
}

func stringToIssueSeverity(s string) v1.IssueSeverity {
	switch s {
	case "error":
		return v1.IssueSeverity_ISSUE_SEVERITY_ERROR
	case "warning":
		return v1.IssueSeverity_ISSUE_SEVERITY_WARNING
	case "info":
		return v1.IssueSeverity_ISSUE_SEVERITY_INFO
	default:
		return v1.IssueSeverity_ISSUE_SEVERITY_UNSPECIFIED
	}
}

func coverageIntentToString(i v1.CoverageIntent) string {
	switch i {
	case v1.CoverageIntent_COVERAGE_INTENT_TEACH:
		return "teach"
	case v1.CoverageIntent_COVERAGE_INTENT_ASSESS:
		return "assess"
	case v1.CoverageIntent_COVERAGE_INTENT_REINFORCE:
		return "reinforce"
	default:
		return ""
	}
}

func coverageLevelToString(l v1.CoverageLevel) string {
	switch l {
	case v1.CoverageLevel_COVERAGE_LEVEL_INTRODUCE:
		return "introduce"
	case v1.CoverageLevel_COVERAGE_LEVEL_DEVELOP:
		return "develop"
	case v1.CoverageLevel_COVERAGE_LEVEL_MASTER:
		return "master"
	default:
		return ""
	}
}
