package connect

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
)

// CourseServiceServer implements the CourseService Connect handler.
type CourseServiceServer struct {
	miraiv1connect.UnimplementedCourseServiceHandler
	courseService *service.CourseService
}

// NewCourseServiceServer creates a new CourseServiceServer.
func NewCourseServiceServer(courseService *service.CourseService) *CourseServiceServer {
	return &CourseServiceServer{courseService: courseService}
}

// ListCourses returns a filtered list of courses.
func (s *CourseServiceServer) ListCourses(
	ctx context.Context,
	req *connect.Request[v1.ListCoursesRequest],
) (*connect.Response[v1.ListCoursesResponse], error) {
	filter := service.ListCoursesFilter{}

	if req.Msg.Status != nil && *req.Msg.Status != v1.CourseStatus_COURSE_STATUS_UNSPECIFIED {
		status := courseStatusFromProto(*req.Msg.Status)
		filter.Status = &status
	}
	if req.Msg.Folder != nil && *req.Msg.Folder != "" {
		filter.Folder = req.Msg.Folder
	}
	if len(req.Msg.Tags) > 0 {
		filter.Tags = req.Msg.Tags
	}

	courses, err := s.courseService.ListCourses(ctx, filter)
	if err != nil {
		return nil, toConnectError(err)
	}

	resp := &v1.ListCoursesResponse{
		Courses: make([]*v1.LibraryEntry, len(courses)),
	}
	for i, c := range courses {
		resp.Courses[i] = libraryEntryToProto(&c)
	}

	return connect.NewResponse(resp), nil
}

// GetCourse returns a specific course by ID.
func (s *CourseServiceServer) GetCourse(
	ctx context.Context,
	req *connect.Request[v1.GetCourseRequest],
) (*connect.Response[v1.GetCourseResponse], error) {
	course, err := s.courseService.GetCourse(ctx, req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	return connect.NewResponse(&v1.GetCourseResponse{
		Course: storedCourseToProto(course),
	}), nil
}

// CreateCourse creates a new course.
func (s *CourseServiceServer) CreateCourse(
	ctx context.Context,
	req *connect.Request[v1.CreateCourseRequest],
) (*connect.Response[v1.CreateCourseResponse], error) {
	input := &service.StoredCourse{}

	if req.Msg.Id != nil {
		input.ID = *req.Msg.Id
	}
	if req.Msg.Settings != nil {
		input.Settings = courseSettingsFromProto(req.Msg.Settings)
	}
	if req.Msg.AssessmentSettings != nil {
		input.AssessmentSettings = assessmentSettingsFromProto(req.Msg.AssessmentSettings)
	}
	// Personas and LearningObjectives would need conversion too

	course, err := s.courseService.CreateCourse(ctx, input)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateCourseResponse{
		Course: storedCourseToProto(course),
	}), nil
}

// UpdateCourse updates an existing course.
func (s *CourseServiceServer) UpdateCourse(
	ctx context.Context,
	req *connect.Request[v1.UpdateCourseRequest],
) (*connect.Response[v1.UpdateCourseResponse], error) {
	updates := &service.StoredCourse{}

	if req.Msg.Settings != nil {
		updates.Settings = courseSettingsFromProto(req.Msg.Settings)
	}
	if req.Msg.Status != nil {
		updates.Status = courseStatusFromProto(*req.Msg.Status)
	}
	if req.Msg.AssessmentSettings != nil {
		updates.AssessmentSettings = assessmentSettingsFromProto(req.Msg.AssessmentSettings)
	}

	course, err := s.courseService.UpdateCourse(ctx, req.Msg.Id, updates)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateCourseResponse{
		Course: storedCourseToProto(course),
	}), nil
}

// DeleteCourse deletes a course by ID.
func (s *CourseServiceServer) DeleteCourse(
	ctx context.Context,
	req *connect.Request[v1.DeleteCourseRequest],
) (*connect.Response[v1.DeleteCourseResponse], error) {
	err := s.courseService.DeleteCourse(ctx, req.Msg.Id)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteCourseResponse{
		Success: true,
	}), nil
}

// GetFolderHierarchy returns the folder structure as a nested tree.
func (s *CourseServiceServer) GetFolderHierarchy(
	ctx context.Context,
	req *connect.Request[v1.GetFolderHierarchyRequest],
) (*connect.Response[v1.GetFolderHierarchyResponse], error) {
	folders, err := s.courseService.GetFolderHierarchy(ctx, req.Msg.IncludeCourseCounts)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Build nested folder structure from flat list
	nestedFolders := buildNestedFolders(folders)

	return connect.NewResponse(&v1.GetFolderHierarchyResponse{
		Folders: nestedFolders,
	}), nil
}

// GetLibrary returns the full library.
func (s *CourseServiceServer) GetLibrary(
	ctx context.Context,
	req *connect.Request[v1.GetLibraryRequest],
) (*connect.Response[v1.GetLibraryResponse], error) {
	library, err := s.courseService.GetLibrary(ctx, req.Msg.IncludeCourseCounts)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetLibraryResponse{
		Library: libraryToProto(library),
	}), nil
}

// Conversion helpers

func courseStatusToProto(s service.CourseStatus) v1.CourseStatus {
	switch s {
	case service.CourseStatusDraft:
		return v1.CourseStatus_COURSE_STATUS_DRAFT
	case service.CourseStatusPublished:
		return v1.CourseStatus_COURSE_STATUS_PUBLISHED
	case service.CourseStatusGenerated:
		return v1.CourseStatus_COURSE_STATUS_GENERATED
	default:
		return v1.CourseStatus_COURSE_STATUS_UNSPECIFIED
	}
}

func courseStatusFromProto(s v1.CourseStatus) service.CourseStatus {
	switch s {
	case v1.CourseStatus_COURSE_STATUS_DRAFT:
		return service.CourseStatusDraft
	case v1.CourseStatus_COURSE_STATUS_PUBLISHED:
		return service.CourseStatusPublished
	case v1.CourseStatus_COURSE_STATUS_GENERATED:
		return service.CourseStatusGenerated
	default:
		return service.CourseStatusDraft
	}
}

func folderTypeToProto(t string) v1.FolderType {
	switch t {
	case "library":
		return v1.FolderType_FOLDER_TYPE_LIBRARY
	case "team":
		return v1.FolderType_FOLDER_TYPE_TEAM
	case "personal":
		return v1.FolderType_FOLDER_TYPE_PERSONAL
	case "folder":
		return v1.FolderType_FOLDER_TYPE_FOLDER
	default:
		return v1.FolderType_FOLDER_TYPE_UNSPECIFIED
	}
}

func libraryEntryToProto(e *service.LibraryEntry) *v1.LibraryEntry {
	entry := &v1.LibraryEntry{
		Id:         e.ID,
		Title:      e.Title,
		Status:     courseStatusToProto(e.Status),
		Folder:     e.Folder,
		Tags:       e.Tags,
		CreatedAt:  timestamppb.New(e.CreatedAt),
		ModifiedAt: timestamppb.New(e.ModifiedAt),
	}
	if e.CreatedBy != "" {
		entry.CreatedBy = &e.CreatedBy
	}
	if e.ThumbnailPath != "" {
		entry.ThumbnailPath = &e.ThumbnailPath
	}
	return entry
}

func folderToProto(f *service.Folder) *v1.Folder {
	folder := &v1.Folder{
		Id:   f.ID,
		Name: f.Name,
		Type: folderTypeToProto(f.Type),
	}
	if f.Parent != "" {
		folder.ParentId = &f.Parent
	}
	return folder
}

// buildNestedFolders converts a flat list of folders with Children IDs into nested proto Folders.
func buildNestedFolders(folders []service.Folder) []*v1.Folder {
	// Create a map for quick lookup
	folderMap := make(map[string]*service.Folder)
	for i := range folders {
		folderMap[folders[i].ID] = &folders[i]
	}

	// Build proto folders with nested children
	protoMap := make(map[string]*v1.Folder)
	for _, f := range folders {
		protoMap[f.ID] = folderToProto(&f)
	}

	// Wire up children
	for _, f := range folders {
		if len(f.Children) > 0 {
			protoFolder := protoMap[f.ID]
			protoFolder.Children = make([]*v1.Folder, 0, len(f.Children))
			for _, childID := range f.Children {
				if childProto, ok := protoMap[childID]; ok {
					protoFolder.Children = append(protoFolder.Children, childProto)
				}
			}
		}
	}

	// Return only root folders (those without a parent or with parent "")
	var roots []*v1.Folder
	for _, f := range folders {
		if f.Parent == "" {
			roots = append(roots, protoMap[f.ID])
		}
	}

	return roots
}

func libraryToProto(l *service.Library) *v1.Library {
	lib := &v1.Library{
		Version:     l.Version,
		LastUpdated: timestamppb.New(l.LastUpdated),
		Courses:     make([]*v1.LibraryEntry, len(l.Courses)),
		Folders:     buildNestedFolders(l.Folders),
	}
	for i, c := range l.Courses {
		lib.Courses[i] = libraryEntryToProto(&c)
	}
	return lib
}

func storedCourseToProto(c *service.StoredCourse) *v1.Course {
	return &v1.Course{
		Id:      c.ID,
		Version: int32(c.Version),
		Status:  courseStatusToProto(c.Status),
		Metadata: &v1.CourseMetadata{
			Id:         c.Metadata.ID,
			Version:    int32(c.Metadata.Version),
			Status:     courseStatusToProto(service.CourseStatus(c.Metadata.Status)),
			CreatedAt:  timestamppb.New(c.Metadata.CreatedAt),
			ModifiedAt: timestamppb.New(c.Metadata.ModifiedAt),
		},
		Settings: &v1.CourseSettings{
			Title:             c.Settings.Title,
			DesiredOutcome:    c.Settings.DesiredOutcome,
			DestinationFolder: c.Settings.DestinationFolder,
			CategoryTags:      c.Settings.CategoryTags,
			DataSource:        c.Settings.DataSource,
		},
		AssessmentSettings: assessmentSettingsToProto(c.AssessmentSettings),
		Content:            contentToProto(&c.Content),
	}
}

func courseSettingsFromProto(s *v1.CourseSettings) service.CourseSettings {
	return service.CourseSettings{
		Title:             s.Title,
		DesiredOutcome:    s.DesiredOutcome,
		DestinationFolder: s.DestinationFolder,
		CategoryTags:      s.CategoryTags,
		DataSource:        s.DataSource,
	}
}

func assessmentSettingsToProto(m map[string]any) *v1.AssessmentSettings {
	if m == nil {
		return nil
	}
	settings := &v1.AssessmentSettings{}
	if v, ok := m["enableEmbeddedKnowledgeChecks"].(bool); ok {
		settings.EnableEmbeddedKnowledgeChecks = v
	}
	if v, ok := m["enableFinalExam"].(bool); ok {
		settings.EnableFinalExam = v
	}
	return settings
}

func assessmentSettingsFromProto(s *v1.AssessmentSettings) map[string]any {
	if s == nil {
		return nil
	}
	return map[string]any{
		"enableEmbeddedKnowledgeChecks": s.EnableEmbeddedKnowledgeChecks,
		"enableFinalExam":               s.EnableFinalExam,
	}
}

func contentToProto(c *service.CourseContent) *v1.CourseContent {
	content := &v1.CourseContent{
		Sections:     make([]*v1.CourseSection, 0, len(c.Sections)),
		CourseBlocks: make([]*v1.CourseBlock, 0, len(c.CourseBlocks)),
	}

	// Convert sections
	for _, s := range c.Sections {
		section := &v1.CourseSection{
			Id:   getString(s, "id"),
			Name: getString(s, "name"),
		}
		if lessons, ok := s["lessons"].([]any); ok {
			section.Lessons = make([]*v1.Lesson, 0, len(lessons))
			for _, l := range lessons {
				if lessonMap, ok := l.(map[string]any); ok {
					lesson := &v1.Lesson{
						Id:    getString(lessonMap, "id"),
						Title: getString(lessonMap, "title"),
					}
					if content, ok := lessonMap["content"].(string); ok {
						lesson.Content = &content
					}
					if blocks, ok := lessonMap["blocks"].([]any); ok {
						lesson.Blocks = convertBlocks(blocks)
					}
					section.Lessons = append(section.Lessons, lesson)
				}
			}
		}
		content.Sections = append(content.Sections, section)
	}

	// Convert course blocks
	content.CourseBlocks = convertBlocks(anySlice(c.CourseBlocks))

	return content
}

func convertBlocks(blocks []any) []*v1.CourseBlock {
	result := make([]*v1.CourseBlock, 0, len(blocks))
	for _, b := range blocks {
		if blockMap, ok := b.(map[string]any); ok {
			block := &v1.CourseBlock{
				Id:      getString(blockMap, "id"),
				Type:    blockTypeFromMap(blockMap),
				Content: getString(blockMap, "content"),
				Order:   int32(getInt(blockMap, "order")),
			}
			if prompt, ok := blockMap["prompt"].(string); ok {
				block.Prompt = &prompt
			}
			result = append(result, block)
		}
	}
	return result
}

func blockTypeFromMap(m map[string]any) v1.BlockType {
	if t, ok := m["type"].(float64); ok {
		return v1.BlockType(int32(t))
	}
	if t, ok := m["type"].(int); ok {
		return v1.BlockType(int32(t))
	}
	return v1.BlockType_BLOCK_TYPE_UNSPECIFIED
}

func getString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func getInt(m map[string]any, key string) int {
	if v, ok := m[key].(float64); ok {
		return int(v)
	}
	if v, ok := m[key].(int); ok {
		return v
	}
	return 0
}

func anySlice(s []map[string]any) []any {
	result := make([]any, len(s))
	for i, v := range s {
		result[i] = v
	}
	return result
}
