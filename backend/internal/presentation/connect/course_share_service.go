package connect

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// CourseShareServiceServer implements the CourseShareService Connect handler.
type CourseShareServiceServer struct {
	miraiv1connect.UnimplementedCourseShareServiceHandler
	shareService *service.CourseShareService
}

// NewCourseShareServiceServer creates a new CourseShareServiceServer.
func NewCourseShareServiceServer(shareService *service.CourseShareService) *CourseShareServiceServer {
	return &CourseShareServiceServer{shareService: shareService}
}

// CreateShareLink creates a new share link for a course.
func (s *CourseShareServiceServer) CreateShareLink(
	ctx context.Context,
	req *connect.Request[v1.CreateShareLinkRequest],
) (*connect.Response[v1.CreateShareLinkResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.GetCourseId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	link, shareURL, err := s.shareService.CreateShareLink(ctx, kratosID, courseID, req.Msg.GetAllowedEmails())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateShareLinkResponse{
		ShareLink: shareLinkToProto(link, shareURL),
	}), nil
}

// ListShareLinks lists all share links for a course.
func (s *CourseShareServiceServer) ListShareLinks(
	ctx context.Context,
	req *connect.Request[v1.ListShareLinksRequest],
) (*connect.Response[v1.ListShareLinksResponse], error) {
	courseID, err := parseUUID(req.Msg.GetCourseId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	links, err := s.shareService.ListShareLinks(ctx, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoLinks := make([]*v1.CourseShareLink, len(links))
	for i, link := range links {
		protoLinks[i] = shareLinkToProto(link, "")
	}

	return connect.NewResponse(&v1.ListShareLinksResponse{
		ShareLinks: protoLinks,
	}), nil
}

// UpdateShareLinkEmails updates the allowed emails for a share link.
func (s *CourseShareServiceServer) UpdateShareLinkEmails(
	ctx context.Context,
	req *connect.Request[v1.UpdateShareLinkEmailsRequest],
) (*connect.Response[v1.UpdateShareLinkEmailsResponse], error) {
	linkID, err := parseUUID(req.Msg.GetShareLinkId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	link, err := s.shareService.UpdateShareLinkEmails(ctx, linkID, req.Msg.GetAllowedEmails())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateShareLinkEmailsResponse{
		ShareLink: shareLinkToProto(link, ""),
	}), nil
}

// DeactivateShareLink deactivates a share link.
func (s *CourseShareServiceServer) DeactivateShareLink(
	ctx context.Context,
	req *connect.Request[v1.DeactivateShareLinkRequest],
) (*connect.Response[v1.DeactivateShareLinkResponse], error) {
	linkID, err := parseUUID(req.Msg.GetShareLinkId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.shareService.DeactivateShareLink(ctx, linkID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeactivateShareLinkResponse{}), nil
}

// ListCourseReviewComments lists all review comments for a course (owner view).
func (s *CourseShareServiceServer) ListCourseReviewComments(
	ctx context.Context,
	req *connect.Request[v1.ListCourseReviewCommentsRequest],
) (*connect.Response[v1.ListCourseReviewCommentsResponse], error) {
	courseID, err := parseUUID(req.Msg.GetCourseId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	comments, err := s.shareService.ListCourseReviewComments(ctx, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.ListCourseReviewCommentsResponse{
		Comments: reviewCommentsToProto(comments),
	}), nil
}

// VerifyShareToken checks if a share token is valid and active (public).
func (s *CourseShareServiceServer) VerifyShareToken(
	ctx context.Context,
	req *connect.Request[v1.VerifyShareTokenRequest],
) (*connect.Response[v1.VerifyShareTokenResponse], error) {
	valid, courseTitle, requiresEmail, err := s.shareService.VerifyShareToken(ctx, req.Msg.GetToken())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.VerifyShareTokenResponse{
		Valid:         valid,
		CourseTitle:   courseTitle,
		RequiresEmail: requiresEmail,
	}), nil
}

// SendVerificationCode sends a 6-digit code to the email (public).
func (s *CourseShareServiceServer) SendVerificationCode(
	ctx context.Context,
	req *connect.Request[v1.SendVerificationCodeRequest],
) (*connect.Response[v1.SendVerificationCodeResponse], error) {
	sent, err := s.shareService.SendVerificationCode(ctx, req.Msg.GetToken(), req.Msg.GetEmail())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.SendVerificationCodeResponse{
		Sent: sent,
	}), nil
}

// VerifyEmailCode validates the code and returns a session token (public).
func (s *CourseShareServiceServer) VerifyEmailCode(
	ctx context.Context,
	req *connect.Request[v1.VerifyEmailCodeRequest],
) (*connect.Response[v1.VerifyEmailCodeResponse], error) {
	sessionToken, courseTitle, err := s.shareService.VerifyEmailCode(ctx, req.Msg.GetToken(), req.Msg.GetEmail(), req.Msg.GetCode())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.VerifyEmailCodeResponse{
		SessionToken: sessionToken,
		CourseTitle:   courseTitle,
	}), nil
}

// GetSharedCourse returns the course structure for a shared viewer (public).
func (s *CourseShareServiceServer) GetSharedCourse(
	ctx context.Context,
	req *connect.Request[v1.GetSharedCourseRequest],
) (*connect.Response[v1.GetSharedCourseResponse], error) {
	data, err := s.shareService.GetSharedCourse(ctx, req.Msg.GetSessionToken())
	if err != nil {
		return nil, toConnectError(err)
	}

	sections := make([]*v1.SharedSection, len(data.Sections))
	for i, s := range data.Sections {
		lessons := make([]*v1.SharedLesson, len(s.Lessons))
		for j, l := range s.Lessons {
			lessons[j] = &v1.SharedLesson{
				Id:             l.ID,
				Title:          l.Title,
				ComponentCount: int32(l.ComponentCount),
			}
		}
		sections[i] = &v1.SharedSection{
			Id:      s.ID,
			Title:   s.Title,
			Lessons: lessons,
		}
	}

	return connect.NewResponse(&v1.GetSharedCourseResponse{
		Course: &v1.SharedCourseData{
			CourseId:       data.CourseID,
			Title:          data.Title,
			DesiredOutcome: data.DesiredOutcome,
			Sections:       sections,
		},
	}), nil
}

// GetSharedLesson returns lesson content and comments (public).
func (s *CourseShareServiceServer) GetSharedLesson(
	ctx context.Context,
	req *connect.Request[v1.GetSharedLessonRequest],
) (*connect.Response[v1.GetSharedLessonResponse], error) {
	title, contentJSON, comments, err := s.shareService.GetSharedLesson(ctx, req.Msg.GetSessionToken(), req.Msg.GetLessonId())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetSharedLessonResponse{
		LessonId:    req.Msg.GetLessonId(),
		Title:       title,
		ContentJson: contentJSON,
		Comments:    reviewCommentsToProto(comments),
	}), nil
}

// AddReviewComment adds a review comment to a lesson (public).
func (s *CourseShareServiceServer) AddReviewComment(
	ctx context.Context,
	req *connect.Request[v1.AddReviewCommentRequest],
) (*connect.Response[v1.AddReviewCommentResponse], error) {
	comment, err := s.shareService.AddReviewComment(ctx, req.Msg.GetSessionToken(), req.Msg.GetLessonId(), req.Msg.GetComment())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.AddReviewCommentResponse{
		Comment: reviewCommentToProto(comment),
	}), nil
}

// ListLessonReviewComments lists comments for a lesson (public).
func (s *CourseShareServiceServer) ListLessonReviewComments(
	ctx context.Context,
	req *connect.Request[v1.ListLessonReviewCommentsRequest],
) (*connect.Response[v1.ListLessonReviewCommentsResponse], error) {
	comments, err := s.shareService.ListLessonReviewComments(ctx, req.Msg.GetSessionToken(), req.Msg.GetLessonId())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.ListLessonReviewCommentsResponse{
		Comments: reviewCommentsToProto(comments),
	}), nil
}

// ExportSharedCoursePDF generates a PDF for a shared course (public).
func (s *CourseShareServiceServer) ExportSharedCoursePDF(
	ctx context.Context,
	req *connect.Request[v1.ExportSharedCoursePDFRequest],
) (*connect.Response[v1.ExportSharedCoursePDFResponse], error) {
	downloadURL, err := s.shareService.ExportSharedCoursePDF(ctx, req.Msg.GetSessionToken())
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.ExportSharedCoursePDFResponse{
		DownloadUrl: downloadURL,
	}), nil
}

// shareLinkToProto converts a ShareLink entity to proto.
func shareLinkToProto(link *entity.ShareLink, shareURL string) *v1.CourseShareLink {
	return &v1.CourseShareLink{
		Id:            link.ID.String(),
		CourseId:      link.CourseID.String(),
		Token:         link.Token,
		AllowedEmails: link.AllowedEmails,
		IsActive:      link.IsActive,
		ShareUrl:      shareURL,
		CreatedAt:     timestamppb.New(link.CreatedAt),
		UpdatedAt:     timestamppb.New(link.UpdatedAt),
	}
}

// reviewCommentToProto converts a ReviewComment entity to proto.
func reviewCommentToProto(comment *entity.ReviewComment) *v1.ReviewComment {
	return &v1.ReviewComment{
		Id:            comment.ID.String(),
		CourseId:      comment.CourseID.String(),
		LessonId:      comment.LessonID,
		ReviewerEmail: comment.ReviewerEmail,
		Comment:       comment.Comment,
		CreatedAt:     timestamppb.New(comment.CreatedAt),
	}
}

// reviewCommentsToProto converts a slice of ReviewComment entities to proto.
func reviewCommentsToProto(comments []*entity.ReviewComment) []*v1.ReviewComment {
	result := make([]*v1.ReviewComment, len(comments))
	for i, c := range comments {
		result[i] = reviewCommentToProto(c)
	}
	return result
}
