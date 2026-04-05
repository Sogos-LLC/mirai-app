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

// ShareContentInput is the input for the share content snapshot workflow.
type ShareContentInput struct {
	ShareLinkID   string   `json:"share_link_id"`
	TenantID      string   `json:"tenant_id"`
	CourseID      string   `json:"course_id"`
	CreatorEmail  string   `json:"creator_email"`
	CreatorName   string   `json:"creator_name"`
	CourseTitle   string   `json:"course_title"`
	AllowedEmails []string `json:"allowed_emails"`
	ShareURL      string   `json:"share_url"`
}

// StripeProvisionInput and FeedbackSyncInput are defined in
// activities/provisioning.go to avoid circular imports
// (workflow → activities → workflow).
