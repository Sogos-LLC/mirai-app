package scorm

import (
	"archive/zip"
	"bytes"
	"embed"
	"fmt"
	"path/filepath"
	"strings"
)

//go:embed assets/*
var assetsFS embed.FS

// Packager creates SCORM 2004 3rd Edition packages.
type Packager struct{}

// NewPackager creates a new SCORM packager.
func NewPackager() *Packager {
	return &Packager{}
}

// Package creates a SCORM 2004 3rd Edition package from course data.
// Returns the ZIP file bytes, or an error if packaging fails.
func (p *Packager) Package(data CourseData) (*PackageResult, error) {
	// Validate course data
	if err := p.validate(data); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Create ZIP buffer
	var buf bytes.Buffer
	zipWriter := zip.NewWriter(&buf)

	// 1. Generate and add imsmanifest.xml
	manifest, err := GenerateManifest(data)
	if err != nil {
		return nil, fmt.Errorf("failed to generate manifest: %w", err)
	}
	if err := p.addFile(zipWriter, "imsmanifest.xml", manifest); err != nil {
		return nil, err
	}

	// 2. Add static assets (JS, CSS)
	if err := p.addAssets(zipWriter); err != nil {
		return nil, fmt.Errorf("failed to add assets: %w", err)
	}

	// 3. Generate and add lesson HTML files
	if err := p.addLessons(zipWriter, data); err != nil {
		return nil, fmt.Errorf("failed to add lessons: %w", err)
	}

	// 4. Add embedded images
	if err := p.addImages(zipWriter, data.Images); err != nil {
		return nil, fmt.Errorf("failed to add images: %w", err)
	}

	// Close ZIP writer
	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("failed to close zip: %w", err)
	}

	result := &PackageResult{
		Data:     buf.Bytes(),
		Filename: fmt.Sprintf("%s.zip", sanitizeFilename(data.Title)),
		Size:     int64(buf.Len()),
	}

	// Check size limits
	if result.Size > MaxPackageSize {
		return nil, fmt.Errorf("package size (%d bytes) exceeds maximum allowed (%d bytes)", result.Size, MaxPackageSize)
	}

	return result, nil
}

// validate checks that the course data is valid for packaging.
func (p *Packager) validate(data CourseData) error {
	if data.ID == "" {
		return fmt.Errorf("course ID is required")
	}
	if data.Title == "" {
		return fmt.Errorf("course title is required")
	}
	if len(data.Sections) == 0 {
		return fmt.Errorf("course must have at least one section")
	}

	lessonCount := 0
	for _, section := range data.Sections {
		if section.Title == "" {
			return fmt.Errorf("section title is required")
		}
		lessonCount += len(section.Lessons)
	}

	if lessonCount == 0 {
		return fmt.Errorf("course must have at least one lesson")
	}

	return nil
}

// addFile adds a file to the ZIP archive.
func (p *Packager) addFile(zw *zip.Writer, path string, content []byte) error {
	w, err := zw.Create(path)
	if err != nil {
		return fmt.Errorf("failed to create %s in zip: %w", path, err)
	}
	_, err = w.Write(content)
	if err != nil {
		return fmt.Errorf("failed to write %s to zip: %w", path, err)
	}
	return nil
}

// addAssets adds the static JS and CSS assets to the ZIP.
func (p *Packager) addAssets(zw *zip.Writer) error {
	// Add SCORM API JavaScript
	jsContent, err := assetsFS.ReadFile("assets/scorm-api.js")
	if err != nil {
		return fmt.Errorf("failed to read scorm-api.js: %w", err)
	}
	if err := p.addFile(zw, "js/scorm-api.js", jsContent); err != nil {
		return err
	}

	// Add CSS styles
	cssContent, err := assetsFS.ReadFile("assets/styles.css")
	if err != nil {
		return fmt.Errorf("failed to read styles.css: %w", err)
	}
	if err := p.addFile(zw, "css/styles.css", cssContent); err != nil {
		return err
	}

	return nil
}

// addLessons generates and adds HTML files for all lessons.
func (p *Packager) addLessons(zw *zip.Writer, data CourseData) error {
	// Calculate total lessons for progress
	totalLessons := 0
	for _, section := range data.Sections {
		totalLessons += len(section.Lessons)
	}

	lessonIndex := 0
	for sIdx, section := range data.Sections {
		for lIdx, lesson := range section.Lessons {
			lessonIndex++

			// Determine navigation hrefs
			hasPrev := lessonIndex > 1
			hasNext := lessonIndex < totalLessons

			prevHref := ""
			nextHref := ""

			if hasPrev {
				prevSIdx, prevLIdx := p.getPrevLesson(data.Sections, sIdx, lIdx)
				prevHref = fmt.Sprintf("../section-%d/lesson-%d.html", prevSIdx+1, prevLIdx+1)
			}

			if hasNext {
				nextSIdx, nextLIdx := p.getNextLesson(data.Sections, sIdx, lIdx)
				nextHref = fmt.Sprintf("../section-%d/lesson-%d.html", nextSIdx+1, nextLIdx+1)
			}

			// Render components
			var components []RenderedComponent
			quizIndex := 0
			for _, comp := range lesson.Components {
				rendered, err := RenderComponent(comp, quizIndex)
				if err != nil {
					return fmt.Errorf("failed to render component in lesson %s: %w", lesson.ID, err)
				}
				components = append(components, rendered)
				if comp.Type == ComponentTypeQuiz || comp.Type == ComponentTypeKnowledge {
					quizIndex++
				}
			}

			// Calculate relative paths to assets
			cssPath := "../../css/styles.css"
			jsPath := "../../js/scorm-api.js"

			htmlData := LessonHTMLData{
				CourseTitle:  data.Title,
				SectionTitle: section.Title,
				SectionIndex: sIdx + 1,
				LessonTitle:  lesson.Title,
				LessonIndex:  lessonIndex,
				TotalLessons: totalLessons,
				Components:   components,
				HasPrev:      hasPrev,
				HasNext:      hasNext,
				PrevHref:     prevHref,
				NextHref:     nextHref,
				LessonID:     lesson.ID,
				ObjectiveID:  fmt.Sprintf("obj_%s", sanitizeID(lesson.ID)),
				SegueText:    lesson.SegueText,
				CSSPath:      cssPath,
				JSPath:       jsPath,
			}

			html, err := GenerateLessonHTML(htmlData)
			if err != nil {
				return fmt.Errorf("failed to generate HTML for lesson %s: %w", lesson.ID, err)
			}

			path := fmt.Sprintf("content/section-%d/lesson-%d.html", sIdx+1, lIdx+1)
			if err := p.addFile(zw, path, html); err != nil {
				return err
			}
		}
	}

	return nil
}

// addImages adds embedded images to the ZIP.
func (p *Packager) addImages(zw *zip.Writer, images []ImageData) error {
	for _, img := range images {
		if len(img.Data) == 0 {
			continue // Skip images without data
		}
		if err := p.addFile(zw, img.LocalPath, img.Data); err != nil {
			return fmt.Errorf("failed to add image %s: %w", img.LocalPath, err)
		}
	}
	return nil
}

// getPrevLesson returns the section and lesson indices for the previous lesson.
func (p *Packager) getPrevLesson(sections []SectionData, sIdx, lIdx int) (int, int) {
	if lIdx > 0 {
		return sIdx, lIdx - 1
	}
	// Go to previous section's last lesson
	prevSIdx := sIdx - 1
	return prevSIdx, len(sections[prevSIdx].Lessons) - 1
}

// getNextLesson returns the section and lesson indices for the next lesson.
func (p *Packager) getNextLesson(sections []SectionData, sIdx, lIdx int) (int, int) {
	if lIdx < len(sections[sIdx].Lessons)-1 {
		return sIdx, lIdx + 1
	}
	// Go to next section's first lesson
	return sIdx + 1, 0
}

// sanitizeFilename creates a safe filename from a title.
func sanitizeFilename(title string) string {
	// Replace spaces with hyphens
	result := strings.ReplaceAll(title, " ", "-")
	// Remove or replace invalid characters
	var safe strings.Builder
	for _, r := range result {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_' {
			safe.WriteRune(r)
		}
	}
	result = safe.String()
	// Limit length
	if len(result) > 50 {
		result = result[:50]
	}
	// Remove trailing hyphens
	result = strings.TrimRight(result, "-")
	if result == "" {
		result = "course-export"
	}
	return result
}

// GetAssetPath returns the path to an embedded asset.
func GetAssetPath(name string) string {
	return filepath.Join("assets", name)
}

// ReadAsset reads an embedded asset file.
func ReadAsset(name string) ([]byte, error) {
	return assetsFS.ReadFile(GetAssetPath(name))
}
