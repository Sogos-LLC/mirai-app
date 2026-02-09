package pdf

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/go-pdf/fpdf"
	"github.com/sogos/mirai-backend/internal/domain/scorm"
)

// renderComponent renders a single component to the PDF.
func renderComponent(p *fpdf.Fpdf, comp ComponentData, contentWidth float64) {
	switch comp.Type {
	case scorm.ComponentTypeText:
		renderText(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeHeading:
		renderHeading(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeImage:
		renderImage(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeQuiz, scorm.ComponentTypeKnowledge:
		renderQuiz(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeCallout:
		renderCallout(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeCode:
		renderCode(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeStatement:
		renderStatement(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeQuote:
		renderQuote(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeList:
		renderList(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeChart:
		renderChart(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeDivider:
		renderDivider(p, contentWidth)
	case scorm.ComponentTypeGallery:
		renderGallery(p, comp.ContentJSON, contentWidth)
	case scorm.ComponentTypeMultimedia:
		renderMultimedia(p, comp.ContentJSON, contentWidth)
	default:
		// Unknown type - render as text
		renderText(p, comp.ContentJSON, contentWidth)
	}
}

// textContentJSON represents the JSON structure for text components.
type textContentJSON struct {
	TextHTML string `json:"textHtml"`
}

// headingContentJSON represents the JSON structure for heading components.
type headingContentJSON struct {
	HeadingLevel int    `json:"headingLevel"`
	HeadingText  string `json:"headingText"`
}

// renderText renders a text component.
func renderText(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	// Parse the JSON to extract the textHtml field
	var content textContentJSON
	if err := json.Unmarshal([]byte(contentJSON), &content); err != nil || content.TextHTML == "" {
		// Fallback: treat contentJSON as raw HTML/text
		text := stripHTML(contentJSON)
		if text == "" {
			return
		}
		renderTextContent(p, text, contentWidth)
		return
	}

	text := stripHTML(content.TextHTML)
	if text == "" {
		return
	}
	renderTextContent(p, text, contentWidth)
}

// renderTextContent renders plain text to the PDF with paragraph splitting.
func renderTextContent(p *fpdf.Fpdf, text string, contentWidth float64) {
	setFont(p, fontFamily, "", fontSizeBody)
	setColor(p, colorDarkGray)

	paragraphs := strings.Split(text, "\n\n")
	for i, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}
		// Replace single newlines with spaces within a paragraph
		para = strings.ReplaceAll(para, "\n", " ")
		p.MultiCell(contentWidth, lineHeight, para, "", "L", false)
		if i < len(paragraphs)-1 {
			p.Ln(paragraphSpacing)
		}
	}
}

// renderHeading renders a heading component.
func renderHeading(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	// Parse the JSON to extract the headingText field
	var content headingContentJSON
	var text string
	if err := json.Unmarshal([]byte(contentJSON), &content); err == nil && content.HeadingText != "" {
		text = stripHTML(content.HeadingText)
	} else {
		// Fallback: treat contentJSON as raw HTML/text
		text = stripHTML(contentJSON)
	}
	if text == "" {
		return
	}

	p.Ln(paragraphSpacing)
	setFont(p, fontFamily, "B", fontSizeH2)
	setColor(p, colorBlack)
	p.MultiCell(contentWidth, lineHeight+1, text, "", "L", false)
	p.Ln(2)
}

// renderImage renders an image component as a placeholder with caption.
func renderImage(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var img scorm.ImageContent
	if err := json.Unmarshal([]byte(contentJSON), &img); err != nil {
		return
	}

	// Draw a placeholder box for the image
	x := p.GetX()
	y := p.GetY()
	boxHeight := 40.0

	checkPageBreak(p, boxHeight+10)
	x = p.GetX()
	y = p.GetY()

	setColor(p, colorLightGray)
	p.SetDrawColor(colorLightGray.R, colorLightGray.G, colorLightGray.B)
	p.SetFillColor(colorVeryLight.R, colorVeryLight.G, colorVeryLight.B)
	p.Rect(x, y, contentWidth, boxHeight, "DF")

	// Image icon/label in center
	setFont(p, fontFamily, "", fontSizeSmall)
	setColor(p, colorMediumGray)
	label := "[Image"
	if img.Alt != "" {
		label += ": " + img.Alt
	}
	label += "]"
	p.SetXY(x, y+boxHeight/2-3)
	p.CellFormat(contentWidth, lineHeight, label, "", 0, "C", false, 0, "")

	p.SetY(y + boxHeight + 2)

	// Caption
	if img.Caption != "" {
		setFont(p, fontFamily, "I", fontSizeSmall)
		setColor(p, colorMediumGray)
		p.MultiCell(contentWidth, lineHeight-1, img.Caption, "", "C", false)
	}
}

// renderQuiz renders a quiz/knowledge check component.
func renderQuiz(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var quiz scorm.QuizContent
	if err := json.Unmarshal([]byte(contentJSON), &quiz); err != nil {
		return
	}

	// Estimate height needed
	checkPageBreak(p, 30+float64(len(quiz.Options))*8)

	// Title bar
	x := p.GetX()
	y := p.GetY()
	setFont(p, fontFamily, "B", fontSizeBody)
	setColor(p, colorPurple)
	p.SetFillColor(colorNoteBg.R, colorNoteBg.G, colorNoteBg.B)
	p.Rect(x, y, contentWidth, 8, "F")
	p.SetXY(x+3, y+1)
	p.CellFormat(contentWidth-6, 6, "Knowledge Check", "", 0, "L", false, 0, "")
	p.SetY(y + 10)

	// Question
	setFont(p, fontFamily, "B", fontSizeBody)
	setColor(p, colorDarkGray)
	p.MultiCell(contentWidth, lineHeight, quiz.Question, "", "L", false)
	p.Ln(2)

	// Options
	setFont(p, fontFamily, "", fontSizeQuizOption)
	for i, opt := range quiz.Options {
		letter := string(rune('A' + i))
		isCorrect := opt.ID == quiz.CorrectAnswerID

		prefix := letter + ") "
		if isCorrect {
			setColor(p, colorGreen)
			prefix = letter + ") \u2713 "
		} else {
			setColor(p, colorDarkGray)
		}

		checkPageBreak(p, lineHeight+2)
		p.CellFormat(contentWidth, lineHeight, prefix+opt.Text, "", 1, "L", false, 0, "")
	}

	// Explanation
	if quiz.Explanation != "" {
		p.Ln(2)
		setFont(p, fontFamily, "I", fontSizeSmall)
		setColor(p, colorMediumGray)
		p.MultiCell(contentWidth, lineHeight-1, quiz.Explanation, "", "L", false)
	}
}

// renderCallout renders a callout component.
func renderCallout(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var callout scorm.CalloutContent
	if err := json.Unmarshal([]byte(contentJSON), &callout); err != nil {
		// Fallback: render as text
		renderText(p, contentJSON, contentWidth)
		return
	}

	// Choose color based on type
	var bgColor, accentColor Color
	var icon string
	switch callout.Type {
	case "tip":
		bgColor = colorTipBg
		accentColor = colorGreen
		icon = "TIP"
	case "warning":
		bgColor = colorWarningBg
		accentColor = colorYellow
		icon = "WARNING"
	case "note":
		bgColor = colorNoteBg
		accentColor = colorPurple
		icon = "NOTE"
	default: // info
		bgColor = colorCalloutBg
		accentColor = colorBlue
		icon = "INFO"
	}

	text := stripHTML(callout.Content)

	// Estimate height
	setFont(p, fontFamily, "", fontSizeBody)
	lines := p.SplitText(text, contentWidth-14)
	boxHeight := float64(len(lines))*lineHeight + 8
	if callout.Title != "" {
		boxHeight += lineHeight + 2
	}

	checkPageBreak(p, boxHeight+4)

	x := p.GetX()
	y := p.GetY()

	// Background
	p.SetFillColor(bgColor.R, bgColor.G, bgColor.B)
	p.Rect(x, y, contentWidth, boxHeight, "F")

	// Left accent border
	p.SetFillColor(accentColor.R, accentColor.G, accentColor.B)
	p.Rect(x, y, 3, boxHeight, "F")

	// Type label / title
	p.SetXY(x+6, y+3)
	if callout.Title != "" {
		setFont(p, fontFamily, "B", fontSizeBody)
		setColor(p, accentColor)
		p.CellFormat(contentWidth-14, lineHeight, callout.Title, "", 1, "L", false, 0, "")
		p.SetX(x + 6)
	} else {
		setFont(p, fontFamily, "B", fontSizeSmall)
		setColor(p, accentColor)
		p.CellFormat(contentWidth-14, lineHeight, icon, "", 1, "L", false, 0, "")
		p.SetX(x + 6)
	}

	// Content
	setFont(p, fontFamily, "", fontSizeBody)
	setColor(p, colorDarkGray)
	p.MultiCell(contentWidth-14, lineHeight, text, "", "L", false)

	p.SetY(y + boxHeight + 2)
}

// renderCode renders a code block component.
func renderCode(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var code scorm.CodeContent
	if err := json.Unmarshal([]byte(contentJSON), &code); err != nil {
		return
	}

	codeText := code.Code
	lines := strings.Split(codeText, "\n")

	// Estimate height
	boxHeight := float64(len(lines))*(lineHeight-1) + 10
	checkPageBreak(p, boxHeight+4)

	x := p.GetX()
	y := p.GetY()

	// Language label
	if code.Language != "" {
		setFont(p, fontFamily, "B", fontSizeSmall-1)
		setColor(p, colorMediumGray)
		p.SetFillColor(colorLightGray.R, colorLightGray.G, colorLightGray.B)
		p.SetXY(x, y)
		p.CellFormat(contentWidth, 5, "  "+strings.ToUpper(code.Language), "", 0, "L", true, 0, "")
		y += 5
	}

	// Code background
	p.SetFillColor(colorCodeBg.R, colorCodeBg.G, colorCodeBg.B)
	p.Rect(x, y, contentWidth, boxHeight-5, "F")

	// Code text
	setFont(p, fontFamilyMono, "", fontSizeCode)
	setColor(p, colorDarkGray)
	p.SetXY(x+4, y+3)
	for _, line := range lines {
		// Truncate long lines
		if len(line) > 100 {
			line = line[:97] + "..."
		}
		p.CellFormat(contentWidth-8, lineHeight-1, line, "", 1, "L", false, 0, "")
		p.SetX(x + 4)
	}

	p.SetY(y + boxHeight - 3)
}

// renderStatement renders a statement/key takeaway component.
func renderStatement(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var stmt scorm.StatementContent
	if err := json.Unmarshal([]byte(contentJSON), &stmt); err != nil {
		renderText(p, contentJSON, contentWidth)
		return
	}

	checkPageBreak(p, 20)

	x := p.GetX()
	y := p.GetY()

	// Left border accent
	p.SetFillColor(colorPurple.R, colorPurple.G, colorPurple.B)
	p.Rect(x, y, 3, 16, "F")

	// Statement text
	p.SetXY(x+8, y+2)
	setFont(p, fontFamily, "B", fontSizeBody+1)
	setColor(p, colorDarkGray)
	p.MultiCell(contentWidth-12, lineHeight+1, stmt.Text, "", "L", false)

	// Subtext
	if stmt.Subtext != "" {
		p.SetX(x + 8)
		setFont(p, fontFamily, "", fontSizeSmall)
		setColor(p, colorMediumGray)
		p.MultiCell(contentWidth-12, lineHeight-1, stmt.Subtext, "", "L", false)
	}

	if p.GetY() < y+18 {
		p.SetY(y + 18)
	}
}

// renderQuote renders a quote component.
func renderQuote(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var quote scorm.QuoteContent
	if err := json.Unmarshal([]byte(contentJSON), &quote); err != nil {
		renderText(p, contentJSON, contentWidth)
		return
	}

	checkPageBreak(p, 20)

	x := p.GetX()
	y := p.GetY()

	// Left border
	p.SetFillColor(colorLightGray.R, colorLightGray.G, colorLightGray.B)
	p.Rect(x, y, 2, 16, "F")

	// Quote text (italic)
	p.SetXY(x+8, y+2)
	setFont(p, fontFamily, "I", fontSizeBody)
	setColor(p, colorDarkGray)
	p.MultiCell(contentWidth-12, lineHeight, fmt.Sprintf("\"%s\"", quote.Text), "", "L", false)

	// Attribution
	attribution := quote.Author
	if quote.Title != "" {
		attribution += ", " + quote.Title
	}
	if quote.Source != "" {
		attribution += " (" + quote.Source + ")"
	}

	p.SetX(x + 8)
	setFont(p, fontFamily, "", fontSizeSmall)
	setColor(p, colorMediumGray)
	p.CellFormat(contentWidth-12, lineHeight, "-- "+attribution, "", 1, "L", false, 0, "")

	if p.GetY() < y+20 {
		p.SetY(y + 20)
	}
}

// renderList renders a list component.
func renderList(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var list scorm.ListContent
	if err := json.Unmarshal([]byte(contentJSON), &list); err != nil {
		renderText(p, contentJSON, contentWidth)
		return
	}

	// List title
	if list.Title != "" {
		setFont(p, fontFamily, "B", fontSizeBody)
		setColor(p, colorDarkGray)
		p.MultiCell(contentWidth, lineHeight, list.Title, "", "L", false)
		p.Ln(2)
	}

	setFont(p, fontFamily, "", fontSizeBody)
	setColor(p, colorDarkGray)

	indent := 8.0
	for i, item := range list.Items {
		checkPageBreak(p, lineHeight+2)

		x := p.GetX()
		var bullet string

		switch list.Style {
		case "numbered", "process":
			bullet = fmt.Sprintf("%d. ", i+1)
		case "icon":
			if item.Icon != "" {
				bullet = item.Icon + " "
			} else {
				bullet = "- "
			}
		default: // bulleted
			bullet = "\u2022 "
		}

		setFont(p, fontFamily, "B", fontSizeBody)
		p.SetX(x + indent)
		bulletWidth := p.GetStringWidth(bullet) + 1
		p.CellFormat(bulletWidth, lineHeight, bullet, "", 0, "L", false, 0, "")

		setFont(p, fontFamily, "", fontSizeBody)
		p.MultiCell(contentWidth-indent-bulletWidth, lineHeight, item.Text, "", "L", false)

		// Description (for process/accordion styles)
		if item.Description != "" && (list.Style == "process" || list.Style == "accordion") {
			p.SetX(x + indent + bulletWidth)
			setFont(p, fontFamily, "I", fontSizeSmall)
			setColor(p, colorMediumGray)
			p.MultiCell(contentWidth-indent-bulletWidth, lineHeight-1, item.Description, "", "L", false)
			setColor(p, colorDarkGray)
		}

		p.Ln(1)
	}
}

// renderChart renders a chart component as a table.
func renderChart(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var chart scorm.ChartContent
	if err := json.Unmarshal([]byte(contentJSON), &chart); err != nil {
		return
	}

	// Chart title
	if chart.Title != "" {
		setFont(p, fontFamily, "B", fontSizeBody)
		setColor(p, colorDarkGray)
		p.MultiCell(contentWidth, lineHeight, chart.Title, "", "L", false)
		p.Ln(2)
	}

	if len(chart.Series) == 0 {
		return
	}

	// Render as a simple table
	numCols := len(chart.Series) + 1
	colWidth := contentWidth / float64(numCols)

	// Header row
	checkPageBreak(p, 20)
	setFont(p, fontFamily, "B", fontSizeSmall)
	setColor(p, colorWhite)
	p.SetFillColor(colorDarkGray.R, colorDarkGray.G, colorDarkGray.B)

	p.CellFormat(colWidth, 7, "Category", "1", 0, "C", true, 0, "")
	for _, series := range chart.Series {
		p.CellFormat(colWidth, 7, series.Name, "1", 0, "C", true, 0, "")
	}
	p.Ln(-1)

	// Data rows
	setFont(p, fontFamily, "", fontSizeSmall)
	if len(chart.Series[0].Data) > 0 {
		fill := false
		for i, point := range chart.Series[0].Data {
			checkPageBreak(p, 7)

			if fill {
				p.SetFillColor(colorVeryLight.R, colorVeryLight.G, colorVeryLight.B)
			} else {
				p.SetFillColor(colorWhite.R, colorWhite.G, colorWhite.B)
			}
			setColor(p, colorDarkGray)

			p.CellFormat(colWidth, 7, point.Label, "1", 0, "L", fill, 0, "")
			for _, series := range chart.Series {
				val := "-"
				if i < len(series.Data) {
					val = fmt.Sprintf("%.2f", series.Data[i].Value)
				}
				p.CellFormat(colWidth, 7, val, "1", 0, "C", fill, 0, "")
			}
			p.Ln(-1)
			fill = !fill
		}
	}

	// Description
	if chart.Description != "" {
		p.Ln(2)
		setFont(p, fontFamily, "I", fontSizeSmall)
		setColor(p, colorMediumGray)
		p.MultiCell(contentWidth, lineHeight-1, chart.Description, "", "L", false)
	}
}

// renderDivider renders a horizontal divider.
func renderDivider(p *fpdf.Fpdf, contentWidth float64) {
	p.Ln(paragraphSpacing)
	x := p.GetX()
	y := p.GetY()
	p.SetDrawColor(colorLightGray.R, colorLightGray.G, colorLightGray.B)
	p.Line(x+contentWidth*0.1, y, x+contentWidth*0.9, y)
	p.Ln(paragraphSpacing)
}

// renderGallery renders a gallery component as image placeholders.
func renderGallery(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var gallery scorm.GalleryContent
	if err := json.Unmarshal([]byte(contentJSON), &gallery); err != nil {
		return
	}

	for _, item := range gallery.Items {
		checkPageBreak(p, 30)
		x := p.GetX()
		y := p.GetY()

		// Placeholder box
		p.SetFillColor(colorVeryLight.R, colorVeryLight.G, colorVeryLight.B)
		p.SetDrawColor(colorLightGray.R, colorLightGray.G, colorLightGray.B)
		p.Rect(x, y, contentWidth, 25, "DF")

		setFont(p, fontFamily, "", fontSizeSmall)
		setColor(p, colorMediumGray)
		label := "[Image: " + item.AltText + "]"
		p.SetXY(x, y+10)
		p.CellFormat(contentWidth, lineHeight, label, "", 0, "C", false, 0, "")

		p.SetY(y + 27)

		// Caption
		if item.Caption != "" {
			setFont(p, fontFamily, "I", fontSizeSmall)
			p.MultiCell(contentWidth, lineHeight-1, item.Caption, "", "C", false)
		}
		p.Ln(2)
	}
}

// renderMultimedia renders a multimedia component as a placeholder.
func renderMultimedia(p *fpdf.Fpdf, contentJSON string, contentWidth float64) {
	var media scorm.MultimediaContent
	if err := json.Unmarshal([]byte(contentJSON), &media); err != nil {
		return
	}

	checkPageBreak(p, 20)
	x := p.GetX()
	y := p.GetY()

	// Placeholder box
	p.SetFillColor(colorVeryLight.R, colorVeryLight.G, colorVeryLight.B)
	p.SetDrawColor(colorLightGray.R, colorLightGray.G, colorLightGray.B)
	p.Rect(x, y, contentWidth, 18, "DF")

	setFont(p, fontFamily, "", fontSizeSmall)
	setColor(p, colorMediumGray)
	mediaType := media.Type
	if len(mediaType) > 0 {
		mediaType = strings.ToUpper(mediaType[:1]) + mediaType[1:]
	}
	label := fmt.Sprintf("[%s: %s]", mediaType, media.Title)
	p.SetXY(x, y+5)
	p.CellFormat(contentWidth, lineHeight, label, "", 0, "C", false, 0, "")

	p.SetY(y + 20)

	if media.Description != "" {
		setFont(p, fontFamily, "I", fontSizeSmall)
		p.MultiCell(contentWidth, lineHeight-1, media.Description, "", "C", false)
	}
}

// --- Helper functions ---

// setFont sets the font on the PDF.
func setFont(p *fpdf.Fpdf, family, style string, size float64) {
	p.SetFont(family, style, size)
}

// setColor sets the text color.
func setColor(p *fpdf.Fpdf, c Color) {
	p.SetTextColor(c.R, c.G, c.B)
}

// checkPageBreak adds a page if the remaining space is insufficient.
func checkPageBreak(p *fpdf.Fpdf, height float64) {
	_, pageHeight := p.GetPageSize()
	if p.GetY()+height > pageHeight-pageMarginBottom {
		p.AddPage()
	}
}

// stripHTML removes HTML tags and decodes common entities.
var htmlTagRegex = regexp.MustCompile(`<[^>]*>`)

func stripHTML(s string) string {
	// Remove HTML tags
	s = htmlTagRegex.ReplaceAllString(s, "")
	// Decode common entities
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.TrimSpace(s)
	return s
}
