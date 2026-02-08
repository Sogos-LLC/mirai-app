package valueobject

import "fmt"

// AIProvider represents supported AI providers.
type AIProvider string

const (
	AIProviderGemini AIProvider = "gemini"
)

func (p AIProvider) String() string {
	return string(p)
}

func (p AIProvider) IsValid() bool {
	switch p {
	case AIProviderGemini:
		return true
	}
	return false
}

func ParseAIProvider(str string) (AIProvider, error) {
	p := AIProvider(str)
	if !p.IsValid() {
		return "", fmt.Errorf("invalid AI provider: %s", str)
	}
	return p, nil
}

// GenerationJobType represents the type of AI generation job.
type GenerationJobType string

const (
	GenerationJobTypeSMEIngestion    GenerationJobType = "sme_ingestion"
	GenerationJobTypeCoursePlanning  GenerationJobType = "course_planning"
	GenerationJobTypeCourseOutline   GenerationJobType = "course_outline"
	GenerationJobTypeLessonContent   GenerationJobType = "lesson_content"
	GenerationJobTypeComponentRegen  GenerationJobType = "component_regen"
	GenerationJobTypeFullCourse      GenerationJobType = "full_course"
	GenerationJobTypeCourseCreation  GenerationJobType = "course_creation"
)

func (t GenerationJobType) String() string {
	return string(t)
}

func (t GenerationJobType) IsValid() bool {
	switch t {
	case GenerationJobTypeSMEIngestion, GenerationJobTypeCoursePlanning,
		GenerationJobTypeCourseOutline, GenerationJobTypeLessonContent,
		GenerationJobTypeComponentRegen, GenerationJobTypeFullCourse,
		GenerationJobTypeCourseCreation:
		return true
	}
	return false
}

func ParseGenerationJobType(str string) (GenerationJobType, error) {
	t := GenerationJobType(str)
	if !t.IsValid() {
		return "", fmt.Errorf("invalid generation job type: %s", str)
	}
	return t, nil
}

// GenerationJobStatus represents job state.
type GenerationJobStatus string

const (
	GenerationJobStatusQueued            GenerationJobStatus = "queued"
	GenerationJobStatusProcessing        GenerationJobStatus = "processing"
	GenerationJobStatusCompleted         GenerationJobStatus = "completed"
	GenerationJobStatusFailed            GenerationJobStatus = "failed"
	GenerationJobStatusCancelled         GenerationJobStatus = "cancelled"
	GenerationJobStatusAwaitingApproval  GenerationJobStatus = "awaiting_approval"
	GenerationJobStatusDeferred          GenerationJobStatus = "deferred"
)

func (s GenerationJobStatus) String() string {
	return string(s)
}

func (s GenerationJobStatus) IsValid() bool {
	switch s {
	case GenerationJobStatusQueued, GenerationJobStatusProcessing,
		GenerationJobStatusCompleted, GenerationJobStatusFailed, GenerationJobStatusCancelled,
		GenerationJobStatusAwaitingApproval, GenerationJobStatusDeferred:
		return true
	}
	return false
}

func ParseGenerationJobStatus(str string) (GenerationJobStatus, error) {
	s := GenerationJobStatus(str)
	if !s.IsValid() {
		return "", fmt.Errorf("invalid generation job status: %s", str)
	}
	return s, nil
}

// OutlineApprovalStatus for generated content review.
type OutlineApprovalStatus string

const (
	OutlineApprovalStatusPendingReview     OutlineApprovalStatus = "pending_review"
	OutlineApprovalStatusApproved          OutlineApprovalStatus = "approved"
	OutlineApprovalStatusRejected          OutlineApprovalStatus = "rejected"
	OutlineApprovalStatusRevisionRequested OutlineApprovalStatus = "revision_requested"
)

func (s OutlineApprovalStatus) String() string {
	return string(s)
}

func (s OutlineApprovalStatus) IsValid() bool {
	switch s {
	case OutlineApprovalStatusPendingReview, OutlineApprovalStatusApproved,
		OutlineApprovalStatusRejected, OutlineApprovalStatusRevisionRequested:
		return true
	}
	return false
}

func ParseOutlineApprovalStatus(str string) (OutlineApprovalStatus, error) {
	s := OutlineApprovalStatus(str)
	if !s.IsValid() {
		return "", fmt.Errorf("invalid outline approval status: %s", str)
	}
	return s, nil
}

// LessonComponentType represents content block types for lessons.
type LessonComponentType string

const (
	LessonComponentTypeText       LessonComponentType = "text"
	LessonComponentTypeHeading    LessonComponentType = "heading"
	LessonComponentTypeImage      LessonComponentType = "image"
	LessonComponentTypeQuiz       LessonComponentType = "quiz"
	LessonComponentTypeCode       LessonComponentType = "code"
	LessonComponentTypeCallout    LessonComponentType = "callout"
	LessonComponentTypeStatement  LessonComponentType = "statement"
	LessonComponentTypeQuote      LessonComponentType = "quote"
	LessonComponentTypeList       LessonComponentType = "list"
	LessonComponentTypeGallery    LessonComponentType = "gallery"
	LessonComponentTypeMultimedia LessonComponentType = "multimedia"
	LessonComponentTypeChart      LessonComponentType = "chart"
	LessonComponentTypeDivider    LessonComponentType = "divider"
	LessonComponentTypeTaskList   LessonComponentType = "task_list"
)

func (t LessonComponentType) String() string {
	return string(t)
}

func (t LessonComponentType) IsValid() bool {
	switch t {
	case LessonComponentTypeText, LessonComponentTypeHeading,
		LessonComponentTypeImage, LessonComponentTypeQuiz,
		LessonComponentTypeCode, LessonComponentTypeCallout,
		LessonComponentTypeStatement, LessonComponentTypeQuote,
		LessonComponentTypeList, LessonComponentTypeGallery,
		LessonComponentTypeMultimedia, LessonComponentTypeChart,
		LessonComponentTypeDivider, LessonComponentTypeTaskList:
		return true
	}
	return false
}

func ParseLessonComponentType(str string) (LessonComponentType, error) {
	t := LessonComponentType(str)
	if !t.IsValid() {
		return "", fmt.Errorf("invalid lesson component type: %s", str)
	}
	return t, nil
}

// HeadingLevel for heading components.
type HeadingLevel string

const (
	HeadingLevelH1 HeadingLevel = "h1"
	HeadingLevelH2 HeadingLevel = "h2"
	HeadingLevelH3 HeadingLevel = "h3"
	HeadingLevelH4 HeadingLevel = "h4"
)

func (l HeadingLevel) String() string {
	return string(l)
}

func (l HeadingLevel) IsValid() bool {
	switch l {
	case HeadingLevelH1, HeadingLevelH2, HeadingLevelH3, HeadingLevelH4:
		return true
	}
	return false
}

func ParseHeadingLevel(str string) (HeadingLevel, error) {
	l := HeadingLevel(str)
	if !l.IsValid() {
		return "", fmt.Errorf("invalid heading level: %s", str)
	}
	return l, nil
}
