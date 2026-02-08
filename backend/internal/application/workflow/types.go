package workflow

// KnowledgeIngestionInput is the input for knowledge ingestion workflows.
type KnowledgeIngestionInput struct {
	SourceID string `json:"source_id"`
	TenantID string `json:"tenant_id"`
	TeamID   string `json:"team_id"`
	FilePath string `json:"file_path"`
}

// CourseExportInput is the input for course export workflows.
type CourseExportInput struct {
	ExportID string `json:"export_id"`
	TenantID string `json:"tenant_id"`
}

// StripeProvisionInput and FeedbackSyncInput are defined in
// activities/provisioning.go to avoid circular imports
// (workflow → activities → workflow).
