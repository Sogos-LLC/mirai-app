package pdf

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

// Generate produces a PDF document from the course data.
func (g *Generator) Generate(data CourseData) (*Result, error) {
	if err := validate(data); err != nil {
		return nil, err
	}

	p := fpdf.New("P", "mm", "A4", "")
	p.SetAutoPageBreak(true, pageMarginBottom)
	p.SetMargins(pageMarginLeft, pageMarginTop, pageMarginRight)

	pageWidth, _ := p.GetPageSize()
	contentWidth := pageWidth - pageMarginLeft - pageMarginRight

	// Footer with page numbers
	p.SetFooterFunc(func() {
		p.SetY(-15)
		setFont(p, fontFamily, "", fontSizeFooter)
		setColor(p, colorMediumGray)
		p.CellFormat(0, 10, fmt.Sprintf("Page %d", p.PageNo()), "", 0, "C", false, 0, "")
	})

	// Title page
	renderTitlePage(p, data, contentWidth)

	// Table of contents
	renderTableOfContents(p, data, contentWidth)

	// Course content
	for sIdx, section := range data.Sections {
		renderSection(p, section, sIdx, contentWidth)
	}

	// Write to buffer
	var buf bytes.Buffer
	if err := p.Output(&buf); err != nil {
		return nil, fmt.Errorf("failed to generate PDF: %w", err)
	}

	if p.Err() {
		return nil, fmt.Errorf("PDF generation error: %w", p.Error())
	}

	filename := sanitizeFilename(data.Title) + ".pdf"
	pdfBytes := buf.Bytes()

	return &Result{
		Data:     pdfBytes,
		Filename: filename,
		Size:     int64(len(pdfBytes)),
	}, nil
}

// validate checks the course data has required fields.
func validate(data CourseData) error {
	if data.Title == "" {
		return fmt.Errorf("course title is required")
	}
	if len(data.Sections) == 0 {
		return fmt.Errorf("course must have at least one section")
	}
	return nil
}

// renderTitlePage creates the cover page.
func renderTitlePage(p *fpdf.Fpdf, data CourseData, contentWidth float64) {
	p.AddPage()

	_, pageHeight := p.GetPageSize()

	// Centered title in upper third
	p.SetY(pageHeight * 0.3)

	// Purple accent line
	x := p.GetX()
	lineWidth := 60.0
	p.SetDrawColor(colorPurple.R, colorPurple.G, colorPurple.B)
	p.SetLineWidth(1.0)
	p.Line(x+(contentWidth-lineWidth)/2, p.GetY(), x+(contentWidth+lineWidth)/2, p.GetY())
	p.Ln(8)

	// Course title
	setFont(p, fontFamily, "B", fontSizeTitle)
	setColor(p, colorBlack)
	p.MultiCell(contentWidth, 12, data.Title, "", "C", false)
	p.Ln(6)

	// Desired outcome as subtitle
	if data.DesiredOutcome != "" {
		setFont(p, fontFamily, "", fontSizeSubtitle)
		setColor(p, colorMediumGray)
		p.MultiCell(contentWidth, 7, data.DesiredOutcome, "", "C", false)
	}

	p.Ln(8)

	// Another accent line
	p.SetDrawColor(colorPurple.R, colorPurple.G, colorPurple.B)
	p.SetLineWidth(1.0)
	y := p.GetY()
	p.Line(x+(contentWidth-lineWidth)/2, y, x+(contentWidth+lineWidth)/2, y)

	// Date at bottom
	p.SetY(pageHeight * 0.75)
	setFont(p, fontFamily, "", fontSizeSmall)
	setColor(p, colorMediumGray)
	p.CellFormat(contentWidth, lineHeight, time.Now().Format("January 2, 2006"), "", 0, "C", false, 0, "")

	// Course stats
	totalLessons := 0
	for _, s := range data.Sections {
		totalLessons += len(s.Lessons)
	}
	p.Ln(6)
	stats := fmt.Sprintf("%d Sections  |  %d Lessons", len(data.Sections), totalLessons)
	p.CellFormat(contentWidth, lineHeight, stats, "", 0, "C", false, 0, "")
}

// renderTableOfContents creates the TOC page.
func renderTableOfContents(p *fpdf.Fpdf, data CourseData, contentWidth float64) {
	p.AddPage()

	setFont(p, fontFamily, "B", fontSizeH1)
	setColor(p, colorBlack)
	p.CellFormat(contentWidth, 10, "Table of Contents", "", 1, "L", false, 0, "")
	p.Ln(sectionSpacing)

	// Accent line under header
	x := p.GetX()
	y := p.GetY()
	p.SetDrawColor(colorPurple.R, colorPurple.G, colorPurple.B)
	p.SetLineWidth(0.5)
	p.Line(x, y, x+contentWidth, y)
	p.Ln(6)

	for sIdx, section := range data.Sections {
		checkPageBreak(p, float64(len(section.Lessons))*lineHeight+lineHeight+6)

		// Section title
		setFont(p, fontFamily, "B", fontSizeBody+1)
		setColor(p, colorDarkGray)
		p.CellFormat(contentWidth, lineHeight+1, fmt.Sprintf("%d. %s", sIdx+1, section.Title), "", 1, "L", false, 0, "")
		p.Ln(1)

		// Lessons
		for lIdx, lesson := range section.Lessons {
			setFont(p, fontFamily, "", fontSizeBody)
			setColor(p, colorMediumGray)
			p.SetX(p.GetX() + 8)
			p.CellFormat(contentWidth-8, lineHeight, fmt.Sprintf("%d.%d  %s", sIdx+1, lIdx+1, lesson.Title), "", 1, "L", false, 0, "")
		}
		p.Ln(3)
	}
}

// renderSection renders a course section and its lessons.
func renderSection(p *fpdf.Fpdf, section SectionData, sectionIndex int, contentWidth float64) {
	// Section header on new page
	p.AddPage()

	// Section number label
	setFont(p, fontFamily, "", fontSizeSmall)
	setColor(p, colorPurple)
	p.CellFormat(contentWidth, lineHeight, fmt.Sprintf("SECTION %d", sectionIndex+1), "", 1, "L", false, 0, "")
	p.Ln(2)

	// Section title
	setFont(p, fontFamily, "B", fontSizeH1)
	setColor(p, colorBlack)
	p.MultiCell(contentWidth, 9, section.Title, "", "L", false)

	// Accent line
	p.Ln(3)
	x := p.GetX()
	y := p.GetY()
	p.SetDrawColor(colorPurple.R, colorPurple.G, colorPurple.B)
	p.SetLineWidth(0.5)
	p.Line(x, y, x+contentWidth*0.3, y)
	p.Ln(sectionSpacing)

	// Lessons
	for lIdx, lesson := range section.Lessons {
		if lIdx > 0 {
			// New page for each lesson (except first in section)
			p.AddPage()
		}

		renderLesson(p, lesson, sectionIndex, lIdx, contentWidth)
	}
}

// renderLesson renders a single lesson.
func renderLesson(p *fpdf.Fpdf, lesson LessonData, sectionIndex, lessonIndex int, contentWidth float64) {
	// Lesson title
	setFont(p, fontFamily, "B", fontSizeH2+1)
	setColor(p, colorDarkGray)
	p.MultiCell(contentWidth, 8, lesson.Title, "", "L", false)

	// Subtitle line
	setFont(p, fontFamily, "", fontSizeSmall)
	setColor(p, colorMediumGray)
	p.CellFormat(contentWidth, lineHeight, fmt.Sprintf("Lesson %d.%d", sectionIndex+1, lessonIndex+1), "", 1, "L", false, 0, "")
	p.Ln(componentSpacing)

	// Segue text
	if lesson.SegueText != "" {
		setFont(p, fontFamily, "I", fontSizeBody)
		setColor(p, colorMediumGray)
		p.MultiCell(contentWidth, lineHeight, lesson.SegueText, "", "L", false)
		p.Ln(componentSpacing)
	}

	// Components
	for _, comp := range lesson.Components {
		renderComponent(p, comp, contentWidth)
		p.Ln(componentSpacing)
	}
}

// sanitizeFilename removes invalid characters from filenames.
func sanitizeFilename(name string) string {
	// Replace invalid chars with hyphens
	replacer := strings.NewReplacer(
		"/", "-", "\\", "-", ":", "-", "*", "-",
		"?", "-", "\"", "-", "<", "-", ">", "-",
		"|", "-", " ", "-",
	)
	result := replacer.Replace(name)
	// Remove consecutive hyphens
	for strings.Contains(result, "--") {
		result = strings.ReplaceAll(result, "--", "-")
	}
	result = strings.Trim(result, "-")
	if result == "" {
		result = "course-export"
	}
	// Limit length
	if len(result) > 100 {
		result = result[:100]
	}
	return strings.ToLower(result)
}
