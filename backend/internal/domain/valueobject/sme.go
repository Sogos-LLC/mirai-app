package valueobject

import "fmt"

// SMEScope defines whether an SME is global or team-scoped.
type SMEScope string

const (
	SMEScopeGlobal SMEScope = "global"
	SMEScopeTeam   SMEScope = "team"
)

func (s SMEScope) String() string {
	return string(s)
}

func (s SMEScope) IsValid() bool {
	switch s {
	case SMEScopeGlobal, SMEScopeTeam:
		return true
	}
	return false
}

func ParseSMEScope(str string) (SMEScope, error) {
	s := SMEScope(str)
	if !s.IsValid() {
		return "", fmt.Errorf("invalid SME scope: %s", str)
	}
	return s, nil
}

// SMEStatus represents the state of an SME entity.
type SMEStatus string

const (
	SMEStatusDraft     SMEStatus = "draft"
	SMEStatusIngesting SMEStatus = "ingesting"
	SMEStatusActive    SMEStatus = "active"
	SMEStatusArchived  SMEStatus = "archived"
)

func (s SMEStatus) String() string {
	return string(s)
}

func (s SMEStatus) IsValid() bool {
	switch s {
	case SMEStatusDraft, SMEStatusIngesting, SMEStatusActive, SMEStatusArchived:
		return true
	}
	return false
}

func ParseSMEStatus(str string) (SMEStatus, error) {
	s := SMEStatus(str)
	if !s.IsValid() {
		return "", fmt.Errorf("invalid SME status: %s", str)
	}
	return s, nil
}

// SMETaskStatus represents the state of a delegated task.
type SMETaskStatus string

const (
	SMETaskStatusPending          SMETaskStatus = "pending"
	SMETaskStatusSubmitted        SMETaskStatus = "submitted"
	SMETaskStatusProcessing       SMETaskStatus = "processing"
	SMETaskStatusCompleted        SMETaskStatus = "completed"
	SMETaskStatusFailed           SMETaskStatus = "failed"
	SMETaskStatusCancelled        SMETaskStatus = "cancelled"
	SMETaskStatusAwaitingReview   SMETaskStatus = "awaiting_review"
	SMETaskStatusChangesRequested SMETaskStatus = "changes_requested"
)

func (s SMETaskStatus) String() string {
	return string(s)
}

func (s SMETaskStatus) IsValid() bool {
	switch s {
	case SMETaskStatusPending, SMETaskStatusSubmitted, SMETaskStatusProcessing,
		SMETaskStatusCompleted, SMETaskStatusFailed, SMETaskStatusCancelled,
		SMETaskStatusAwaitingReview, SMETaskStatusChangesRequested:
		return true
	}
	return false
}

func ParseSMETaskStatus(str string) (SMETaskStatus, error) {
	s := SMETaskStatus(str)
	if !s.IsValid() {
		return "", fmt.Errorf("invalid SME task status: %s", str)
	}
	return s, nil
}

// ContentType for uploaded materials.
type ContentType string

const (
	ContentTypeDocument ContentType = "document"
	ContentTypeImage    ContentType = "image"
	ContentTypeVideo    ContentType = "video"
	ContentTypeAudio    ContentType = "audio"
	ContentTypeURL      ContentType = "url"
	ContentTypeText     ContentType = "text"
)

func (c ContentType) String() string {
	return string(c)
}

func (c ContentType) IsValid() bool {
	switch c {
	case ContentTypeDocument, ContentTypeImage, ContentTypeVideo,
		ContentTypeAudio, ContentTypeURL, ContentTypeText:
		return true
	}
	return false
}

func ParseContentType(str string) (ContentType, error) {
	c := ContentType(str)
	if !c.IsValid() {
		return "", fmt.Errorf("invalid content type: %s", str)
	}
	return c, nil
}

// EnhanceType for AI content enhancement operations.
type EnhanceType string

const (
	EnhanceTypeSummarize EnhanceType = "summarize"
	EnhanceTypeImprove   EnhanceType = "improve"
)

func (e EnhanceType) String() string {
	return string(e)
}

func (e EnhanceType) IsValid() bool {
	switch e {
	case EnhanceTypeSummarize, EnhanceTypeImprove:
		return true
	}
	return false
}

func ParseEnhanceType(str string) (EnhanceType, error) {
	e := EnhanceType(str)
	if !e.IsValid() {
		return "", fmt.Errorf("invalid enhance type: %s", str)
	}
	return e, nil
}
