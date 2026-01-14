// Package scorm provides SCORM 2004 3rd Edition package generation.
package scorm

// CourseData represents the input data for generating a SCORM package.
type CourseData struct {
	ID             string
	Title          string
	DesiredOutcome string
	Sections       []SectionData
	Images         []ImageData // Images to embed in package
}

// SectionData represents a section/module in the course.
type SectionData struct {
	ID      string
	Title   string
	Lessons []LessonData
}

// LessonData represents a lesson within a section.
type LessonData struct {
	ID         string
	Title      string
	SegueText  string // Transition text to next lesson
	Components []ComponentData
}

// ComponentData represents a content component within a lesson.
type ComponentData struct {
	ID          string
	Type        ComponentType
	ContentJSON string // JSON-encoded content specific to the type
}

// ImageData represents an image to be embedded in the package.
type ImageData struct {
	OriginalURL string // MinIO URL to download from
	LocalPath   string // Path within the ZIP (e.g., "assets/images/abc123.jpg")
	Data        []byte // Image bytes after download/optimization
}

// ComponentType represents the type of lesson component.
type ComponentType string

const (
	ComponentTypeText       ComponentType = "text"
	ComponentTypeHeading    ComponentType = "heading"
	ComponentTypeImage      ComponentType = "image"
	ComponentTypeQuiz       ComponentType = "quiz"
	ComponentTypeCallout    ComponentType = "callout"
	ComponentTypeCode       ComponentType = "code"
	ComponentTypeKnowledge  ComponentType = "knowledge_check"
	ComponentTypeStatement  ComponentType = "statement"
)

// QuizContent represents the JSON structure for quiz components.
type QuizContent struct {
	Question        string       `json:"question"`
	QuestionType    string       `json:"question_type,omitempty"`
	Options         []QuizOption `json:"options"`
	CorrectAnswerID string       `json:"correct_answer_id"`
	Explanation     string       `json:"explanation,omitempty"`
}

// QuizOption represents a single answer option in a quiz.
type QuizOption struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// ImageContent represents the JSON structure for image components.
type ImageContent struct {
	URL     string `json:"url"`
	Alt     string `json:"alt,omitempty"`
	Caption string `json:"caption,omitempty"`
}

// CalloutContent represents the JSON structure for callout components.
type CalloutContent struct {
	Type    string `json:"type"` // "info", "warning", "tip", "note"
	Title   string `json:"title,omitempty"`
	Content string `json:"content"`
}

// CodeContent represents the JSON structure for code components.
type CodeContent struct {
	Language string `json:"language"`
	Code     string `json:"code"`
}

// StatementContent represents the JSON structure for statement components.
// Statements are key takeaways that emphasize critical concepts.
type StatementContent struct {
	Text    string `json:"text"`
	Subtext string `json:"subtext,omitempty"`
}

// PackageResult contains the generated SCORM package.
type PackageResult struct {
	Data     []byte // ZIP file bytes
	Filename string // Suggested filename
	Size     int64  // Size in bytes
}

// MaxPackageSize is the hard limit for package size (500MB).
const MaxPackageSize = 500 * 1024 * 1024

// WarnPackageSize is the size at which we warn (100MB).
const WarnPackageSize = 100 * 1024 * 1024
