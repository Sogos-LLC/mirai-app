package valueobject

import "fmt"

// ExportFormat represents supported export formats.
type ExportFormat string

const (
	ExportFormatSCORM12   ExportFormat = "scorm_12"
	ExportFormatSCORM2004 ExportFormat = "scorm_2004"
	ExportFormatXAPI      ExportFormat = "xapi"
	ExportFormatPDF       ExportFormat = "pdf"
)

// String returns the string representation.
func (f ExportFormat) String() string {
	return string(f)
}

// ParseExportFormat parses a string into an ExportFormat.
func ParseExportFormat(s string) (ExportFormat, error) {
	switch s {
	case "scorm_12":
		return ExportFormatSCORM12, nil
	case "scorm_2004":
		return ExportFormatSCORM2004, nil
	case "xapi":
		return ExportFormatXAPI, nil
	case "pdf":
		return ExportFormatPDF, nil
	default:
		return "", fmt.Errorf("invalid export format: %s", s)
	}
}

// ExportStatus represents the status of an export job.
type ExportStatus string

const (
	ExportStatusPending    ExportStatus = "pending"
	ExportStatusProcessing ExportStatus = "processing"
	ExportStatusCompleted  ExportStatus = "completed"
	ExportStatusFailed     ExportStatus = "failed"
)

// String returns the string representation.
func (s ExportStatus) String() string {
	return string(s)
}

// ParseExportStatus parses a string into an ExportStatus.
func ParseExportStatus(s string) (ExportStatus, error) {
	switch s {
	case "pending":
		return ExportStatusPending, nil
	case "processing":
		return ExportStatusProcessing, nil
	case "completed":
		return ExportStatusCompleted, nil
	case "failed":
		return ExportStatusFailed, nil
	default:
		return "", fmt.Errorf("invalid export status: %s", s)
	}
}

// IsTerminal returns true if the status is a terminal state.
func (s ExportStatus) IsTerminal() bool {
	return s == ExportStatusCompleted || s == ExportStatusFailed
}

// IsActive returns true if the export is still in progress.
func (s ExportStatus) IsActive() bool {
	return s == ExportStatusPending || s == ExportStatusProcessing
}
