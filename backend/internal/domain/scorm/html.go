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
