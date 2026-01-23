package valueobject

import "fmt"

// KnowledgeSourceType defines the type of knowledge source.
type KnowledgeSourceType string

const (
	KnowledgeSourceTypeFileUpload   KnowledgeSourceType = "file_upload"
	KnowledgeSourceTypeGoogleDrive  KnowledgeSourceType = "google_drive"
	KnowledgeSourceTypeOneDrive     KnowledgeSourceType = "onedrive"
	KnowledgeSourceTypeS3           KnowledgeSourceType = "s3"
	KnowledgeSourceTypeGoogleSheets KnowledgeSourceType = "google_sheets"
	KnowledgeSourceTypeMicrosoft365 KnowledgeSourceType = "microsoft_365"
	KnowledgeSourceTypeURL          KnowledgeSourceType = "url"
)

func (t KnowledgeSourceType) String() string {
	return string(t)
}

func (t KnowledgeSourceType) IsValid() bool {
	switch t {
	case KnowledgeSourceTypeFileUpload, KnowledgeSourceTypeGoogleDrive,
		KnowledgeSourceTypeOneDrive, KnowledgeSourceTypeS3,
		KnowledgeSourceTypeGoogleSheets, KnowledgeSourceTypeMicrosoft365,
		KnowledgeSourceTypeURL:
		return true
	}
	return false
}

func ParseKnowledgeSourceType(str string) (KnowledgeSourceType, error) {
	t := KnowledgeSourceType(str)
	if !t.IsValid() {
		return "", fmt.Errorf("invalid knowledge source type: %s", str)
	}
	return t, nil
}

// KnowledgeSourceStatus tracks the ingestion state.
type KnowledgeSourceStatus string

const (
	KnowledgeSourceStatusPending    KnowledgeSourceStatus = "pending"
	KnowledgeSourceStatusProcessing KnowledgeSourceStatus = "processing"
	KnowledgeSourceStatusReady      KnowledgeSourceStatus = "ready"
	KnowledgeSourceStatusFailed     KnowledgeSourceStatus = "failed"
)

func (s KnowledgeSourceStatus) String() string {
	return string(s)
}

func (s KnowledgeSourceStatus) IsValid() bool {
	switch s {
	case KnowledgeSourceStatusPending, KnowledgeSourceStatusProcessing,
		KnowledgeSourceStatusReady, KnowledgeSourceStatusFailed:
		return true
	}
	return false
}

func ParseKnowledgeSourceStatus(str string) (KnowledgeSourceStatus, error) {
	s := KnowledgeSourceStatus(str)
	if !s.IsValid() {
		return "", fmt.Errorf("invalid knowledge source status: %s", str)
	}
	return s, nil
}
