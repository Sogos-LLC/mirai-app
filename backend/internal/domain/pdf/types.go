// Package pdf provides PDF document generation from course data.
package pdf

import "github.com/sogos/mirai-backend/internal/domain/scorm"

// Generator produces PDF documents from course data.
type Generator struct{}

// NewGenerator creates a new PDF generator.
func NewGenerator() *Generator {
	return &Generator{}
}

// Result contains the generated PDF document.
type Result struct {
	Data     []byte // PDF file bytes
	Filename string // Suggested filename
	Size     int64  // Size in bytes
}

// CourseData is an alias for the shared course data type.
type CourseData = scorm.CourseData

// SectionData is an alias for the shared section data type.
type SectionData = scorm.SectionData

// LessonData is an alias for the shared lesson data type.
type LessonData = scorm.LessonData

// ComponentData is an alias for the shared component data type.
type ComponentData = scorm.ComponentData
