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
	ComponentTypeQuote      ComponentType = "quote"
	ComponentTypeList       ComponentType = "list"
	ComponentTypeGallery    ComponentType = "gallery"
	ComponentTypeMultimedia ComponentType = "multimedia"
	ComponentTypeChart      ComponentType = "chart"
	ComponentTypeDivider    ComponentType = "divider"
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

// QuoteContent represents the JSON structure for quote components.
// Quotes are expert insights with attribution.
type QuoteContent struct {
	Text   string `json:"text"`
	Author string `json:"author"`
	Title  string `json:"title,omitempty"`
	Source string `json:"source,omitempty"`
}

// ListItem represents a single item in a list component.
type ListItem struct {
	Text        string `json:"text"`
	Icon        string `json:"icon,omitempty"`
	Description string `json:"description,omitempty"`
}

// ListContent represents the JSON structure for list components.
// Lists can be bulleted, numbered, with icons, process steps, or accordions.
type ListContent struct {
	Style string     `json:"style"` // bulleted, numbered, icon, process, accordion
	Items []ListItem `json:"items"`
	Title string     `json:"title,omitempty"`
}

// GalleryHotspot represents a clickable hotspot on a labeled graphic.
type GalleryHotspot struct {
	ID          string  `json:"id"`
	X           float64 `json:"x"` // 0-100 percentage
	Y           float64 `json:"y"` // 0-100 percentage
	Label       string  `json:"label"`
	Description string  `json:"description"`
}

// GalleryItem represents a single image in a gallery.
type GalleryItem struct {
	ImageDescription string           `json:"imageDescription"`
	URL              string           `json:"url,omitempty"`
	AltText          string           `json:"altText"`
	Caption          string           `json:"caption,omitempty"`
	Hotspots         []GalleryHotspot `json:"hotspots,omitempty"`
}

// GalleryContent represents the JSON structure for gallery components.
// Galleries can be carousels or labeled graphics with hotspots.
type GalleryContent struct {
	Style string        `json:"style"` // carousel, labeled_graphic
	Items []GalleryItem `json:"items"`
}

// MultimediaContent represents the JSON structure for multimedia components.
// Multimedia can be video, audio, or interactive embeds.
type MultimediaContent struct {
	Type          string `json:"type"` // video, audio, interactive
	URL           string `json:"url"`
	Title         string `json:"title"`
	Description   string `json:"description,omitempty"`
	Provider      string `json:"provider,omitempty"` // youtube, vimeo, soundcloud, etc.
	IsPlaceholder bool   `json:"isPlaceholder,omitempty"`
}

// ChartDataPoint represents a single data point in a chart.
type ChartDataPoint struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Color string  `json:"color,omitempty"`
}

// ChartSeries represents a series of data points in a chart.
type ChartSeries struct {
	Name string           `json:"name"`
	Data []ChartDataPoint `json:"data"`
}

// ChartContent represents the JSON structure for chart components.
// Charts can be bar, line, pie, donut, or table.
type ChartContent struct {
	Type        string        `json:"type"` // bar, line, pie, donut, table
	Title       string        `json:"title"`
	Series      []ChartSeries `json:"series"`
	XAxisLabel  string        `json:"xAxisLabel,omitempty"`
	YAxisLabel  string        `json:"yAxisLabel,omitempty"`
	Description string        `json:"description,omitempty"` // Accessibility description
}

// DividerContent represents the JSON structure for divider components.
// Dividers are simple horizontal separators.
type DividerContent struct {
	Style string `json:"style,omitempty"` // Reserved for future styling
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
