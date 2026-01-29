package scorm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"html/template"
	"strings"
)

// LessonHTMLData contains all data needed to render a lesson HTML page.
type LessonHTMLData struct {
	CourseTitle   string
	SectionTitle  string
	SectionIndex  int
	LessonTitle   string
	LessonIndex   int
	TotalLessons  int
	Components    []RenderedComponent
	HasPrev       bool
	HasNext       bool
	PrevHref      string
	NextHref      string
	LessonID      string
	ObjectiveID   string
	SegueText     string
	CSSPath       string
	JSPath        string
}

// RenderedComponent contains the HTML for a single component.
type RenderedComponent struct {
	Type string
	HTML template.HTML
}

// lessonTemplate is the base HTML template for lesson pages.
const lessonTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.LessonTitle}} - {{.CourseTitle}}</title>
    <link rel="stylesheet" href="{{.CSSPath}}">
</head>
<body>
    <div class="course-container">
        <header class="course-header">
            <div class="breadcrumb">
                <span class="section-title">{{.SectionTitle}}</span>
                <span class="separator">/</span>
                <span class="lesson-title">{{.LessonTitle}}</span>
            </div>
            <div class="progress-info">
                Lesson {{.LessonIndex}} of {{.TotalLessons}}
            </div>
        </header>

        <main class="lesson-content">
            <h1 class="lesson-title">{{.LessonTitle}}</h1>

            {{range .Components}}
            <div class="component component-{{.Type}}">
                {{.HTML}}
            </div>
            {{end}}

            {{if .SegueText}}
            <div class="segue-text">
                <p>{{.SegueText}}</p>
            </div>
            {{end}}
        </main>

        <footer class="lesson-footer">
            <nav class="lesson-nav">
                {{if .HasPrev}}
                <a href="{{.PrevHref}}" class="nav-button prev-button">
                    <span class="nav-icon">&larr;</span>
                    <span class="nav-text">Previous</span>
                </a>
                {{else}}
                <span class="nav-button prev-button disabled">
                    <span class="nav-icon">&larr;</span>
                    <span class="nav-text">Previous</span>
                </span>
                {{end}}

                <button id="complete-button" class="nav-button complete-button" onclick="markComplete()">
                    Mark Complete
                </button>

                {{if .HasNext}}
                <a href="{{.NextHref}}" class="nav-button next-button" id="next-button">
                    <span class="nav-text">Next</span>
                    <span class="nav-icon">&rarr;</span>
                </a>
                {{else}}
                <button class="nav-button next-button finish-button" onclick="finishCourse()">
                    <span class="nav-text">Finish Course</span>
                    <span class="nav-icon">&#10003;</span>
                </button>
                {{end}}
            </nav>
        </footer>
    </div>

    <script src="{{.JSPath}}"></script>
    <script>
        // Initialize SCORM
        var scorm = new SCORM2004Wrapper({ debug: true });
        var lessonObjectiveID = "{{.ObjectiveID}}";
        var lessonID = "{{.LessonID}}";
        var isCompleted = false;

        window.onload = function() {
            scorm.initialize();

            // Check if resuming
            if (scorm.isResumeSession()) {
                var state = scorm.loadState();
                if (state.lessons && state.lessons[lessonID]) {
                    isCompleted = state.lessons[lessonID].completed;
                    updateUI();
                }
            }

            // Set bookmark
            scorm.setBookmark(lessonID);
        };

        window.onbeforeunload = function() {
            if (!isCompleted) {
                scorm.setSuspend();
            }
            scorm.terminate();
        };

        function markComplete() {
            isCompleted = true;

            // Update objective
            var count = parseInt(scorm.getValue('cmi.objectives._count')) || 0;
            scorm.setValue('cmi.objectives.' + count + '.id', lessonObjectiveID);
            scorm.setValue('cmi.objectives.' + count + '.success_status', 'passed');
            scorm.setValue('cmi.objectives.' + count + '.completion_status', 'completed');

            // Save state
            var state = scorm.loadState();
            if (!state.lessons) state.lessons = {};
            state.lessons[lessonID] = { completed: true, timestamp: Date.now() };
            scorm.saveState(state);

            // Update progress
            updateProgress();
            updateUI();
            scorm.commit();
        }

        function updateProgress() {
            var state = scorm.loadState();
            var completedCount = 0;
            if (state.lessons) {
                for (var id in state.lessons) {
                    if (state.lessons[id].completed) completedCount++;
                }
            }
            var progress = completedCount / {{.TotalLessons}};
            scorm.setProgressMeasure(progress);
        }

        function finishCourse() {
            markComplete();
            scorm.setComplete(true);
            scorm.terminate();
            alert('Congratulations! You have completed the course.');
        }

        function updateUI() {
            var btn = document.getElementById('complete-button');
            if (isCompleted) {
                btn.textContent = 'Completed ✓';
                btn.classList.add('completed');
                btn.disabled = true;
            }
        }

        // Quiz handling
        var quizAnswers = {};

        function selectQuizAnswer(quizId, optionId) {
            quizAnswers[quizId] = optionId;
            // Update UI to show selection
            var options = document.querySelectorAll('#quiz-' + quizId + ' .quiz-option');
            options.forEach(function(opt) {
                opt.classList.remove('selected');
                if (opt.getAttribute('data-option-id') === optionId) {
                    opt.classList.add('selected');
                }
            });
            // Show check button
            document.getElementById('check-' + quizId).style.display = 'inline-block';
        }

        function checkQuizAnswer(quizId, correctAnswerId, explanation) {
            var selected = quizAnswers[quizId];
            if (selected === undefined) return;

            var isCorrect = selected === correctAnswerId;
            var options = document.querySelectorAll('#quiz-' + quizId + ' .quiz-option');

            options.forEach(function(opt) {
                var optId = opt.getAttribute('data-option-id');
                opt.classList.remove('selected');
                if (optId === correctAnswerId) {
                    opt.classList.add('correct');
                } else if (optId === selected && !isCorrect) {
                    opt.classList.add('incorrect');
                }
                opt.onclick = null; // Disable further clicks
            });

            // Show feedback
            var feedback = document.getElementById('feedback-' + quizId);
            feedback.innerHTML = (isCorrect ? '<strong>Correct!</strong> ' : '<strong>Incorrect.</strong> ') + explanation;
            feedback.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'incorrect');
            feedback.style.display = 'block';

            // Hide check button
            document.getElementById('check-' + quizId).style.display = 'none';

            // Record interaction
            var count = parseInt(scorm.getValue('cmi.interactions._count')) || 0;
            scorm.setValue('cmi.interactions.' + count + '.id', 'quiz_' + quizId);
            scorm.setValue('cmi.interactions.' + count + '.type', 'choice');
            scorm.setValue('cmi.interactions.' + count + '.learner_response', String(selected));
            scorm.setValue('cmi.interactions.' + count + '.correct_responses.0.pattern', String(correctAnswer));
            scorm.setValue('cmi.interactions.' + count + '.result', isCorrect ? 'correct' : 'incorrect');
            scorm.commit();
        }
    </script>
</body>
</html>`

// GenerateLessonHTML generates the HTML for a single lesson page.
func GenerateLessonHTML(data LessonHTMLData) ([]byte, error) {
	tmpl, err := template.New("lesson").Parse(lessonTemplate)
	if err != nil {
		return nil, fmt.Errorf("failed to parse lesson template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("failed to execute lesson template: %w", err)
	}

	return buf.Bytes(), nil
}

// RenderComponent converts a ComponentData into HTML.
func RenderComponent(comp ComponentData, quizIndex int) (RenderedComponent, error) {
	rendered := RenderedComponent{Type: string(comp.Type)}

	switch comp.Type {
	case ComponentTypeText:
		// Text content - render as paragraphs
		rendered.HTML = template.HTML(fmt.Sprintf(`<div class="text-content">%s</div>`, formatTextContent(comp.ContentJSON)))

	case ComponentTypeHeading:
		// Heading - render as h2
		rendered.HTML = template.HTML(fmt.Sprintf(`<h2>%s</h2>`, html.EscapeString(comp.ContentJSON)))

	case ComponentTypeImage:
		var img ImageContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &img); err != nil {
			// Fallback: treat as URL string
			rendered.HTML = template.HTML(fmt.Sprintf(`<figure><img src="%s" alt=""></figure>`, html.EscapeString(comp.ContentJSON)))
		} else {
			caption := ""
			if img.Caption != "" {
				caption = fmt.Sprintf(`<figcaption>%s</figcaption>`, html.EscapeString(img.Caption))
			}
			rendered.HTML = template.HTML(fmt.Sprintf(
				`<figure><img src="%s" alt="%s">%s</figure>`,
				html.EscapeString(img.URL),
				html.EscapeString(img.Alt),
				caption,
			))
		}

	case ComponentTypeQuiz, ComponentTypeKnowledge:
		var quiz QuizContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &quiz); err != nil {
			return rendered, fmt.Errorf("failed to parse quiz content: %w", err)
		}
		rendered.HTML = template.HTML(renderQuiz(comp.ID, quiz, quizIndex))

	case ComponentTypeCallout:
		var callout CalloutContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &callout); err != nil {
			// Fallback: render as simple callout
			rendered.HTML = template.HTML(fmt.Sprintf(`<div class="callout callout-info"><p>%s</p></div>`, formatTextContent(comp.ContentJSON)))
		} else {
			title := ""
			if callout.Title != "" {
				title = fmt.Sprintf(`<div class="callout-title">%s</div>`, html.EscapeString(callout.Title))
			}
			rendered.HTML = template.HTML(fmt.Sprintf(
				`<div class="callout callout-%s">%s<div class="callout-content">%s</div></div>`,
				html.EscapeString(callout.Type),
				title,
				formatTextContent(callout.Content),
			))
		}

	case ComponentTypeCode:
		var code CodeContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &code); err != nil {
			// Fallback: render as preformatted text
			rendered.HTML = template.HTML(fmt.Sprintf(`<pre><code>%s</code></pre>`, html.EscapeString(comp.ContentJSON)))
		} else {
			rendered.HTML = template.HTML(fmt.Sprintf(
				`<pre><code class="language-%s">%s</code></pre>`,
				html.EscapeString(code.Language),
				html.EscapeString(code.Code),
			))
		}

	case ComponentTypeStatement:
		var stmt StatementContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &stmt); err != nil {
			// Fallback: render as simple statement
			rendered.HTML = template.HTML(fmt.Sprintf(`<div class="statement"><p class="statement-text">%s</p></div>`, html.EscapeString(comp.ContentJSON)))
		} else {
			subtext := ""
			if stmt.Subtext != "" {
				subtext = fmt.Sprintf(`<p class="statement-subtext">%s</p>`, html.EscapeString(stmt.Subtext))
			}
			rendered.HTML = template.HTML(fmt.Sprintf(
				`<div class="statement"><p class="statement-text">%s</p>%s</div>`,
				html.EscapeString(stmt.Text),
				subtext,
			))
		}

	case ComponentTypeQuote:
		var quote QuoteContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &quote); err != nil {
			rendered.HTML = template.HTML(fmt.Sprintf(`<blockquote class="quote"><p>%s</p></blockquote>`, html.EscapeString(comp.ContentJSON)))
		} else {
			attribution := html.EscapeString(quote.Author)
			if quote.Title != "" {
				attribution += fmt.Sprintf(`, <span class="quote-title">%s</span>`, html.EscapeString(quote.Title))
			}
			source := ""
			if quote.Source != "" {
				source = fmt.Sprintf(`<cite class="quote-source">%s</cite>`, html.EscapeString(quote.Source))
			}
			rendered.HTML = template.HTML(fmt.Sprintf(
				`<blockquote class="quote"><p class="quote-text">"%s"</p><footer class="quote-attribution">— %s%s</footer></blockquote>`,
				html.EscapeString(quote.Text),
				attribution,
				source,
			))
		}

	case ComponentTypeList:
		var list ListContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &list); err != nil {
			rendered.HTML = template.HTML(fmt.Sprintf(`<div class="list">%s</div>`, html.EscapeString(comp.ContentJSON)))
		} else {
			rendered.HTML = template.HTML(renderList(list))
		}

	case ComponentTypeGallery:
		var gallery GalleryContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &gallery); err != nil {
			rendered.HTML = template.HTML(`<div class="gallery">Gallery content unavailable</div>`)
		} else {
			rendered.HTML = template.HTML(renderGallery(gallery))
		}

	case ComponentTypeMultimedia:
		var media MultimediaContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &media); err != nil {
			rendered.HTML = template.HTML(`<div class="multimedia">Media content unavailable</div>`)
		} else {
			rendered.HTML = template.HTML(renderMultimedia(media))
		}

	case ComponentTypeChart:
		var chart ChartContent
		if err := json.Unmarshal([]byte(comp.ContentJSON), &chart); err != nil {
			rendered.HTML = template.HTML(`<div class="chart">Chart content unavailable</div>`)
		} else {
			rendered.HTML = template.HTML(renderChart(chart))
		}

	case ComponentTypeDivider:
		rendered.HTML = template.HTML(`<hr class="divider">`)

	default:
		// Unknown type - render as text
		rendered.HTML = template.HTML(fmt.Sprintf(`<div class="unknown-content">%s</div>`, formatTextContent(comp.ContentJSON)))
	}

	return rendered, nil
}

// renderQuiz generates HTML for a quiz component.
func renderQuiz(id string, quiz QuizContent, index int) string {
	quizID := sanitizeID(id)
	if quizID == "" {
		quizID = fmt.Sprintf("quiz_%d", index)
	}

	var options strings.Builder
	for _, opt := range quiz.Options {
		options.WriteString(fmt.Sprintf(
			`<button class="quiz-option" data-option-id="%s" onclick="selectQuizAnswer('%s', '%s')">%s</button>`,
			html.EscapeString(opt.ID),
			quizID,
			html.EscapeString(opt.ID),
			html.EscapeString(opt.Text),
		))
	}

	explanation := html.EscapeString(quiz.Explanation)
	if explanation == "" {
		explanation = "Review the lesson content for more information."
	}

	return fmt.Sprintf(`
<div class="knowledge-check" id="quiz-%s">
    <h4 class="quiz-title">Knowledge Check</h4>
    <p class="quiz-question">%s</p>
    <div class="quiz-options">
        %s
    </div>
    <button id="check-%s" class="check-answer-button" style="display:none" onclick="checkQuizAnswer('%s', '%s', '%s')">
        Check Answer
    </button>
    <div id="feedback-%s" class="quiz-feedback" style="display:none"></div>
</div>`,
		quizID,
		html.EscapeString(quiz.Question),
		options.String(),
		quizID,
		quizID, html.EscapeString(quiz.CorrectAnswerID), escapeJSString(explanation),
		quizID,
	)
}

// formatTextContent formats text content, converting newlines to paragraphs.
func formatTextContent(content string) string {
	// If content looks like HTML, return as-is
	if strings.Contains(content, "<p>") || strings.Contains(content, "<div>") {
		return content
	}

	// Split by double newlines for paragraphs
	paragraphs := strings.Split(content, "\n\n")
	var result strings.Builder
	for _, p := range paragraphs {
		p = strings.TrimSpace(p)
		if p != "" {
			// Convert single newlines to <br> within paragraphs
			p = strings.ReplaceAll(p, "\n", "<br>")
			result.WriteString(fmt.Sprintf("<p>%s</p>", p))
		}
	}
	return result.String()
}

// escapeJSString escapes a string for use in JavaScript.
func escapeJSString(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "'", "\\'")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\r", "\\r")
	return s
}

// renderList generates HTML for a list component.
func renderList(list ListContent) string {
	var items strings.Builder

	// Determine list tag based on style
	listTag := "ul"
	listClass := "list list-" + list.Style
	if list.Style == "numbered" {
		listTag = "ol"
	}

	for _, item := range list.Items {
		itemClass := "list-item"
		icon := ""
		description := ""

		if list.Style == "icon" && item.Icon != "" {
			icon = fmt.Sprintf(`<span class="list-icon">%s</span>`, html.EscapeString(item.Icon))
		}

		if (list.Style == "process" || list.Style == "accordion") && item.Description != "" {
			description = fmt.Sprintf(`<div class="list-item-description">%s</div>`, html.EscapeString(item.Description))
		}

		items.WriteString(fmt.Sprintf(
			`<li class="%s">%s<span class="list-item-text">%s</span>%s</li>`,
			itemClass,
			icon,
			html.EscapeString(item.Text),
			description,
		))
	}

	title := ""
	if list.Title != "" {
		title = fmt.Sprintf(`<h4 class="list-title">%s</h4>`, html.EscapeString(list.Title))
	}

	return fmt.Sprintf(`<div class="%s">%s<%s>%s</%s></div>`,
		listClass, title, listTag, items.String(), listTag)
}

// renderGallery generates HTML for a gallery component.
func renderGallery(gallery GalleryContent) string {
	var items strings.Builder

	for i, item := range gallery.Items {
		caption := ""
		if item.Caption != "" {
			caption = fmt.Sprintf(`<figcaption>%s</figcaption>`, html.EscapeString(item.Caption))
		}

		imgSrc := item.URL
		if imgSrc == "" {
			imgSrc = fmt.Sprintf("data:image/svg+xml,%%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%%3E%%3Crect fill='%%23ddd' width='400' height='300'/%%3E%%3Ctext x='50%%25' y='50%%25' text-anchor='middle' dy='.3em' fill='%%23999'%%3E%s%%3C/text%%3E%%3C/svg%%3E",
				html.EscapeString(item.ImageDescription))
		}

		// Render hotspots for labeled graphics
		hotspots := ""
		if gallery.Style == "labeled_graphic" && len(item.Hotspots) > 0 {
			var hs strings.Builder
			for _, h := range item.Hotspots {
				hs.WriteString(fmt.Sprintf(
					`<button class="gallery-hotspot" style="left: %.1f%%; top: %.1f%%;" data-label="%s" title="%s">%s</button>`,
					h.X, h.Y,
					html.EscapeString(h.Label),
					html.EscapeString(h.Description),
					html.EscapeString(h.Label),
				))
			}
			hotspots = fmt.Sprintf(`<div class="gallery-hotspots">%s</div>`, hs.String())
		}

		items.WriteString(fmt.Sprintf(
			`<figure class="gallery-item" data-index="%d"><img src="%s" alt="%s">%s%s</figure>`,
			i,
			html.EscapeString(imgSrc),
			html.EscapeString(item.AltText),
			caption,
			hotspots,
		))
	}

	galleryClass := "gallery gallery-" + gallery.Style
	if gallery.Style == "carousel" && len(gallery.Items) > 1 {
		return fmt.Sprintf(`<div class="%s"><div class="gallery-items">%s</div><div class="gallery-nav"><button class="gallery-prev" onclick="prevGalleryItem(this)">‹</button><button class="gallery-next" onclick="nextGalleryItem(this)">›</button></div></div>`,
			galleryClass, items.String())
	}

	return fmt.Sprintf(`<div class="%s"><div class="gallery-items">%s</div></div>`,
		galleryClass, items.String())
}

// renderMultimedia generates HTML for a multimedia component.
func renderMultimedia(media MultimediaContent) string {
	title := html.EscapeString(media.Title)
	description := ""
	if media.Description != "" {
		description = fmt.Sprintf(`<p class="multimedia-description">%s</p>`, html.EscapeString(media.Description))
	}

	if media.IsPlaceholder {
		return fmt.Sprintf(
			`<div class="multimedia multimedia-placeholder"><div class="multimedia-icon">▶</div><h4 class="multimedia-title">%s</h4>%s<p class="multimedia-note">Media placeholder - content to be added</p></div>`,
			title, description)
	}

	switch media.Type {
	case "video":
		// Handle YouTube/Vimeo embeds
		if strings.Contains(media.URL, "youtube.com") || strings.Contains(media.URL, "youtu.be") {
			videoID := extractYouTubeID(media.URL)
			return fmt.Sprintf(
				`<div class="multimedia multimedia-video"><iframe src="https://www.youtube.com/embed/%s" frameborder="0" allowfullscreen title="%s"></iframe>%s</div>`,
				html.EscapeString(videoID), title, description)
		}
		if strings.Contains(media.URL, "vimeo.com") {
			videoID := extractVimeoID(media.URL)
			return fmt.Sprintf(
				`<div class="multimedia multimedia-video"><iframe src="https://player.vimeo.com/video/%s" frameborder="0" allowfullscreen title="%s"></iframe>%s</div>`,
				html.EscapeString(videoID), title, description)
		}
		// Fallback to video tag
		return fmt.Sprintf(
			`<div class="multimedia multimedia-video"><video controls><source src="%s" type="video/mp4">Your browser does not support video.</video>%s</div>`,
			html.EscapeString(media.URL), description)

	case "audio":
		return fmt.Sprintf(
			`<div class="multimedia multimedia-audio"><h4 class="multimedia-title">%s</h4><audio controls><source src="%s" type="audio/mpeg">Your browser does not support audio.</audio>%s</div>`,
			title, html.EscapeString(media.URL), description)

	case "interactive":
		return fmt.Sprintf(
			`<div class="multimedia multimedia-interactive"><iframe src="%s" frameborder="0" title="%s"></iframe>%s</div>`,
			html.EscapeString(media.URL), title, description)

	default:
		return fmt.Sprintf(
			`<div class="multimedia"><a href="%s" target="_blank">%s</a>%s</div>`,
			html.EscapeString(media.URL), title, description)
	}
}

// extractYouTubeID extracts the video ID from a YouTube URL.
func extractYouTubeID(url string) string {
	// Handle youtu.be/ID format
	if strings.Contains(url, "youtu.be/") {
		parts := strings.Split(url, "youtu.be/")
		if len(parts) > 1 {
			id := strings.Split(parts[1], "?")[0]
			return strings.TrimSpace(id)
		}
	}
	// Handle youtube.com/watch?v=ID format
	if strings.Contains(url, "v=") {
		parts := strings.Split(url, "v=")
		if len(parts) > 1 {
			id := strings.Split(parts[1], "&")[0]
			return strings.TrimSpace(id)
		}
	}
	return url
}

// extractVimeoID extracts the video ID from a Vimeo URL.
func extractVimeoID(url string) string {
	parts := strings.Split(url, "vimeo.com/")
	if len(parts) > 1 {
		id := strings.Split(parts[1], "?")[0]
		return strings.TrimSpace(id)
	}
	return url
}

// renderChart generates HTML for a chart component.
func renderChart(chart ChartContent) string {
	title := html.EscapeString(chart.Title)
	description := ""
	if chart.Description != "" {
		description = fmt.Sprintf(`<p class="chart-description sr-only">%s</p>`, html.EscapeString(chart.Description))
	}

	// For table type, render as HTML table
	if chart.Type == "table" {
		return renderChartAsTable(chart)
	}

	// For other chart types, render a simplified static version
	// (Full chart rendering would require Chart.js in the SCORM player)
	var data strings.Builder
	for _, series := range chart.Series {
		data.WriteString(fmt.Sprintf(`<div class="chart-series"><h5>%s</h5><ul>`, html.EscapeString(series.Name)))
		for _, point := range series.Data {
			data.WriteString(fmt.Sprintf(`<li>%s: %.2f</li>`, html.EscapeString(point.Label), point.Value))
		}
		data.WriteString(`</ul></div>`)
	}

	return fmt.Sprintf(
		`<div class="chart chart-%s"><h4 class="chart-title">%s</h4>%s<div class="chart-data">%s</div></div>`,
		html.EscapeString(chart.Type), title, description, data.String())
}

// renderChartAsTable renders chart data as an HTML table.
func renderChartAsTable(chart ChartContent) string {
	title := html.EscapeString(chart.Title)
	description := ""
	if chart.Description != "" {
		description = fmt.Sprintf(`<caption class="sr-only">%s</caption>`, html.EscapeString(chart.Description))
	}

	// Build table header from first series labels
	var headers strings.Builder
	headers.WriteString(`<tr><th scope="col">Category</th>`)
	for _, series := range chart.Series {
		headers.WriteString(fmt.Sprintf(`<th scope="col">%s</th>`, html.EscapeString(series.Name)))
	}
	headers.WriteString(`</tr>`)

	// Build table rows
	var rows strings.Builder
	if len(chart.Series) > 0 && len(chart.Series[0].Data) > 0 {
		for i, point := range chart.Series[0].Data {
			rows.WriteString(fmt.Sprintf(`<tr><th scope="row">%s</th>`, html.EscapeString(point.Label)))
			for _, series := range chart.Series {
				if i < len(series.Data) {
					rows.WriteString(fmt.Sprintf(`<td>%.2f</td>`, series.Data[i].Value))
				} else {
					rows.WriteString(`<td>-</td>`)
				}
			}
			rows.WriteString(`</tr>`)
		}
	}

	return fmt.Sprintf(
		`<div class="chart chart-table"><h4 class="chart-title">%s</h4><table class="chart-table-data">%s<thead>%s</thead><tbody>%s</tbody></table></div>`,
		title, description, headers.String(), rows.String())
}
