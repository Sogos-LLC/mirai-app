package content

import (
	"encoding/json"
	"fmt"
	"time"
)

// S3CourseContent is stored in S3 - the heavy content payload.
type S3CourseContent struct {
	Settings           CourseSettings       `json:"settings"`
	WizardData         *WizardData          `json:"wizardData,omitempty"`
	Personas           []map[string]any     `json:"personas"`
	LearningObjectives []map[string]any     `json:"learningObjectives"`
	AssessmentSettings map[string]any       `json:"assessmentSettings"`
	Content            CourseContent        `json:"content"`
	Exports            []map[string]any     `json:"exports,omitempty"`
	GeneratedLessons   []GeneratedLesson    `json:"generatedLessons,omitempty"`
	CurriculumMap      *CurriculumMap       `json:"curriculumMap,omitempty"`
	OutlineProvenance  *OutlineProvenance   `json:"outlineProvenance,omitempty"`
	CoursePlan         *CoursePlan          `json:"coursePlan,omitempty"`
}

// CourseContent represents the course content structure.
type CourseContent struct {
	Sections     []map[string]any `json:"sections"`
	CourseBlocks []map[string]any `json:"courseBlocks,omitempty"`
}

// CourseSettings represents the course settings.
type CourseSettings struct {
	Title             string   `json:"title"`
	DesiredOutcome    string   `json:"desiredOutcome"`
	DestinationFolder string   `json:"destinationFolder,omitempty"`
	CategoryTags      []string `json:"categoryTags,omitempty"`
	DataSource        string   `json:"dataSource,omitempty"`
}

// WizardData stores wizard selections for AI context and realignment.
// This is persisted with the course so AI generation and realignment have access to personas.
type WizardData struct {
	SMEPersonas         []SMEPersona      `json:"smePersonas"`
	SelectedSMEIDs      []string          `json:"selectedSmeIds"`
	AudiencePersonas    []AudiencePersona `json:"audiencePersonas"`
	SelectedAudienceIDs []string          `json:"selectedAudienceIds"`
	SelectedTone        *ToneOption       `json:"selectedTone,omitempty"`
	AdditionalContext   string            `json:"additionalContext"`
	DesiredOutcomes     string            `json:"desiredOutcomes"`
	// InternalDataOnly: When true, course content is generated exclusively from
	// uploaded knowledge sources. AI will not add external information.
	InternalDataOnly bool `json:"internalDataOnly"`
	// SelectedTeamDocIDs contains the IDs of team-level knowledge sources selected for this course.
	// These are used for RAG during outline and lesson generation.
	SelectedTeamDocIDs []string `json:"selectedTeamDocIds,omitempty"`
	// SelectedGlobalDocIDs contains the IDs of global/tenant-level knowledge sources selected for this course.
	// These are used for RAG during outline and lesson generation.
	SelectedGlobalDocIDs []string `json:"selectedGlobalDocIds,omitempty"`
}

// SMEPersona represents an SME (Subject Matter Expert) persona.
type SMEPersona struct {
	ID          string   `json:"id"`
	JobTitle    string   `json:"jobTitle"`
	Description string   `json:"description"`
	Skills      []string `json:"skills"`
	Voice       string   `json:"voice"`
}

// AudiencePersona represents an audience persona.
type AudiencePersona struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Description string   `json:"description"`
	Goals       []string `json:"goals"`
}

// ToneOption represents the selected tone/style for the course.
type ToneOption struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	LevelOfDetail string `json:"levelOfDetail"`
}

// CurriculumMap represents the curriculum coverage matrix.
type CurriculumMap struct {
	ID                      string                    `json:"id"`
	OutlineVersionHash      string                    `json:"outlineVersionHash"`
	Rows                    []CurriculumRow           `json:"rows"`
	Issues                  []CurriculumValidationIssue `json:"issues"`
	Status                  string                    `json:"status"` // "pending", "valid", "warnings", "approved", "stale"
	GeneratedAt             time.Time                 `json:"generatedAt"`
	ApprovedAt              *time.Time                `json:"approvedAt,omitempty"`
	ApprovedByUserID        *string                   `json:"approvedByUserId,omitempty"`
	AggregateGroundingScore float32                   `json:"aggregateGroundingScore"`
	TotalSourceCount        int32                     `json:"totalSourceCount"`
}

// CurriculumRow represents a section row in the curriculum matrix.
type CurriculumRow struct {
	SectionID    string           `json:"sectionId"`
	SectionTitle string           `json:"sectionTitle"`
	SectionOrder int32            `json:"sectionOrder"`
	Cells        []CurriculumCell `json:"cells"`
}

// CurriculumCell represents a coverage cell (section x outcome intersection).
type CurriculumCell struct {
	OutcomeID   string   `json:"outcomeId"`
	OutcomeText string   `json:"outcomeText"`
	Intent      string   `json:"intent"` // "teach", "assess", "reinforce"
	Level       string   `json:"level"`  // "introduce", "develop", "master"
	Emphasis    int32    `json:"emphasis"`
	LessonIDs   []string `json:"lessonIds"`
	Confidence  float32  `json:"confidence"`
}

// CurriculumValidationIssue represents a validation issue in the curriculum.
type CurriculumValidationIssue struct {
	Rule      string  `json:"rule"`
	Severity  string  `json:"severity"` // "error", "warning", "info"
	Message   string  `json:"message"`
	OutcomeID *string `json:"outcomeId,omitempty"`
	SectionID *string `json:"sectionId,omitempty"`
}

// GeneratedLesson represents a generated lesson stored in content.json.
type GeneratedLesson struct {
	ID                  string            `json:"id"`
	SectionID           string            `json:"sectionId"`
	OutlineLessonID     string            `json:"outlineLessonId"`
	Title               string            `json:"title"`
	SegueText           *string           `json:"segueText,omitempty"`
	Components          []LessonComponent `json:"components"`
	GeneratedAt         time.Time         `json:"generatedAt"`
	AggregateProvenance *LessonProvenance `json:"aggregateProvenance,omitempty"`
}

// LessonComponent represents a lesson component stored in content.json.
type LessonComponent struct {
	ID                   string               `json:"id"`
	Type                 string               `json:"type"` // LessonComponentType string value (e.g., "text", "heading", "image")
	Order                int32                `json:"order"`
	ContentJSON          json.RawMessage      `json:"contentJson"`
	LearningObjectiveIDs []string             `json:"learningObjectiveIds,omitempty"`
	CreatedAt            time.Time            `json:"createdAt"`
	UpdatedAt            time.Time            `json:"updatedAt"`
	Provenance           *ComponentProvenance `json:"provenance,omitempty"`
}

// componentTypeIntToString maps proto enum int values to string names.
// Handles legacy S3 data where type was stored as int instead of string.
var componentTypeIntToString = map[int]string{
	1: "text", 2: "heading", 3: "image", 4: "quiz", 5: "code",
	6: "callout", 7: "statement", 8: "quote", 9: "list", 13: "divider",
}

// UnmarshalJSON handles both string and int type fields for backwards compatibility.
func (c *LessonComponent) UnmarshalJSON(data []byte) error {
	// Alias to avoid recursion
	type Alias LessonComponent
	raw := struct {
		Alias
		Type json.RawMessage `json:"type"`
	}{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*c = LessonComponent(raw.Alias)

	// Try string first
	var strType string
	if err := json.Unmarshal(raw.Type, &strType); err == nil {
		c.Type = strType
		return nil
	}

	// Fall back to int (legacy format)
	var intType int
	if err := json.Unmarshal(raw.Type, &intType); err == nil {
		if name, ok := componentTypeIntToString[intType]; ok {
			c.Type = name
			return nil
		}
		return fmt.Errorf("unknown component type int: %d", intType)
	}

	return fmt.Errorf("component type must be string or int, got: %s", string(raw.Type))
}

// ProvenanceChunk represents a knowledge chunk that contributed to generated content.
type ProvenanceChunk struct {
	ChunkID         string  `json:"chunkId"`
	SourceID        string  `json:"sourceId"`
	SourceName      string  `json:"sourceName"`
	Excerpt         string  `json:"excerpt"`         // First 200 chars of content
	SimilarityScore float32 `json:"similarityScore"` // Relevance score from vector search
	Scope           string  `json:"scope"`           // "course", "team", or "global"
}

// ComponentProvenance tracks which knowledge sources contributed to a component.
type ComponentProvenance struct {
	SourceChunks []ProvenanceChunk `json:"sourceChunks"`
	Queries      []string          `json:"queries,omitempty"` // Search queries used
	TeamTokens   int32             `json:"teamTokens"`        // Tokens from team sources
	GlobalTokens int32             `json:"globalTokens"`      // Tokens from global sources
	CourseTokens int32             `json:"courseTokens"`       // Tokens from course sources
	TotalTokens  int32             `json:"totalTokens"`       // Total tokens used
	GeneratedAt  time.Time         `json:"generatedAt"`
}

// LessonProvenance aggregates provenance across all components in a lesson.
type LessonProvenance struct {
	GroundingScore   float32 `json:"groundingScore"`   // 0.0 - 1.0, ratio of grounded content
	TeamTokens       int32   `json:"teamTokens"`       // Tokens from team sources
	GlobalTokens     int32   `json:"globalTokens"`     // Tokens from global sources
	CourseTokens     int32   `json:"courseTokens"`      // Tokens from course sources
	UngroundedTokens int32   `json:"ungroundedTokens"` // Tokens not from RAG
	TotalTokens      int32   `json:"totalTokens"`      // Total tokens in lesson
	SourceCount      int32   `json:"sourceCount"`      // Number of unique sources
}

// OutlineProvenance tracks aggregate knowledge source attribution for outline generation.
type OutlineProvenance struct {
	TotalSources       int       `json:"totalSources"`       // Number of unique knowledge sources
	TotalChunks        int       `json:"totalChunks"`        // Total chunks used
	TeamTokens         int32     `json:"teamTokens"`         // Tokens from team sources
	GlobalTokens       int32     `json:"globalTokens"`       // Tokens from global sources
	CourseTokens       int32     `json:"courseTokens"`        // Tokens from course sources
	GroundingScore     float32   `json:"groundingScore"`     // Aggregate grounding 0.0-1.0
	GeneratedAt        time.Time `json:"generatedAt"`        // When outline was generated
	ConstraintsApplied bool      `json:"constraintsApplied"` // Whether constraints were enforced
	ConstraintsMet     bool      `json:"constraintsMet"`     // Whether output met constraints
}

// CoursePlan is the AI-generated course structure plan stored in S3.
type CoursePlan struct {
	DocumentAnalyses []DocumentAnalysis `json:"documentAnalyses"`
	PlannedSections  []PlannedSection   `json:"plannedSections"`
	Status           string             `json:"status"` // "pending_review", "approved"
	GeneratedAt      time.Time          `json:"generatedAt"`
	ApprovedAt       *time.Time         `json:"approvedAt,omitempty"`
	TokensUsed       int64              `json:"tokensUsed"`
}

// DocumentAnalysis is Gemini's structured summary of one knowledge source.
type DocumentAnalysis struct {
	SourceID     string        `json:"sourceId"`
	SourceName   string        `json:"sourceName"`
	Summary      string        `json:"summary"`
	MainTopics   []string      `json:"mainTopics"`
	KeyFacts     []string      `json:"keyFacts"`
	ContentDepth string        `json:"contentDepth"` // basic/intermediate/advanced
	SectionHints []SectionHint `json:"sectionHints"`
}

// SectionHint is a suggested course section derived from one document.
type SectionHint struct {
	TopicName   string   `json:"topicName"`
	SearchTerms []string `json:"searchTerms"`
	KeyPoints   []string `json:"keyPoints"`
}

// PlannedSection is a planned course section with targeted search terms.
type PlannedSection struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	SearchTerms []string        `json:"searchTerms"`
	SourceIDs   []string        `json:"sourceIds"`
	Lessons     []PlannedLesson `json:"lessons"`
	Rationale   string          `json:"rationale"`
}

// PlannedLesson is a planned lesson with its own search terms.
type PlannedLesson struct {
	Title         string   `json:"title"`
	Description   string   `json:"description"`
	SearchTerms   []string `json:"searchTerms"`
	LearningGoals []string `json:"learningGoals"`
}

// FindLesson finds a generated lesson by ID.
func FindLesson(content *S3CourseContent, lessonID string) *GeneratedLesson {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lessonID {
			return &content.GeneratedLessons[i]
		}
	}
	return nil
}

// UpsertLesson adds or updates a lesson in the content.
func UpsertLesson(content *S3CourseContent, lesson GeneratedLesson) {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lesson.ID {
			content.GeneratedLessons[i] = lesson
			return
		}
	}
	content.GeneratedLessons = append(content.GeneratedLessons, lesson)
}
