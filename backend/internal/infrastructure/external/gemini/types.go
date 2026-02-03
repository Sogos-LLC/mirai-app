package gemini

import (
	"encoding/json"
)

// Outline generation types

type sectionsOnlyResponse struct {
	Sections []sectionOutline `json:"sections"`
}

type sectionOutline struct {
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	LessonTitles []string `json:"lesson_titles"`

	// Section metadata for curriculum planning
	Level                string `json:"level"`                  // "introduce", "develop", "master"
	Intent               string `json:"intent"`                 // "teach", "assess", "reinforce"
	Emphasis             string `json:"emphasis"`               // "low", "medium", "high"
	MappedOutcomeIndices []int  `json:"mapped_outcome_indices"` // Indices of course outcomes addressed
}

type sectionLessonsResponse struct {
	Lessons []outlineLesson `json:"lessons"`
}

type outlineLesson struct {
	Title                    string   `json:"title"`
	Description              string   `json:"description"`
	EstimatedDurationMinutes int      `json:"estimated_duration_minutes"`
	LearningObjectives       []string `json:"learning_objectives"`
}

// Lesson generation types

type lessonContentResponse struct {
	Components []flatLessonComponent `json:"components"`
	SegueText  string                `json:"segue_text"`
}

type componentPlanResponse struct {
	Components []plannedComponent `json:"components"`
}

type plannedComponent struct {
	ComponentType string `json:"component_type"`
	Purpose       string `json:"purpose"`
}

type segueResponse struct {
	SegueText string `json:"segue_text"`
}

// Individual component response types

type singleTextComponent struct {
	TextHTML string `json:"text_html"`
}

type singleHeadingComponent struct {
	HeadingLevel int    `json:"heading_level"`
	HeadingText  string `json:"heading_text"`
}

type singleImageComponent struct {
	ImageDescription string `json:"image_description"`
	ImageAltText     string `json:"image_alt_text"`
	ImageCaption     string `json:"image_caption"`
}

type singleQuizComponent struct {
	QuizQuestion        string       `json:"quiz_question"`
	QuizOptions         []quizOption `json:"quiz_options"`
	QuizCorrectAnswerID string       `json:"quiz_correct_answer_id"`
	QuizExplanation     string       `json:"quiz_explanation"`
}

type singleCodeComponent struct {
	Code     string `json:"code"`
	Language string `json:"language"`
}

type singleCalloutComponent struct {
	Style   string `json:"style"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

type singleStatementComponent struct {
	StatementText    string `json:"statement_text"`
	StatementSubtext string `json:"statement_subtext"`
}

type singleQuoteComponent struct {
	Text        string `json:"text"`
	Attribution string `json:"attribution"`
}

type singleListComponent struct {
	Style string           `json:"style"`
	Title string           `json:"title"`
	Items []listItemResult `json:"items"`
}

type listItemResult struct {
	Text        string `json:"text"`
	Description string `json:"description,omitempty"`
}

type singleGalleryComponent struct {
	Style  string               `json:"style"`
	Images []galleryImageResult `json:"images"`
}

type galleryImageResult struct {
	Description string `json:"description"`
	AltText     string `json:"alt_text"`
	Caption     string `json:"caption"`
}

type singleMultimediaComponent struct {
	MediaType   string `json:"media_type"`
	Description string `json:"description"`
	Caption     string `json:"caption"`
}

type singleChartComponent struct {
	ChartType string    `json:"chart_type"`
	Title     string    `json:"title"`
	Labels    []string  `json:"labels"`
	Values    []float64 `json:"values"`
}

type singleDividerComponent struct {
	Style string `json:"style"`
}

// flatLessonComponent matches the flat schema where all fields are at the same level
type flatLessonComponent struct {
	ComponentType       string       `json:"component_type"`
	TextHTML            string       `json:"text_html,omitempty"`
	HeadingLevel        int          `json:"heading_level,omitempty"`
	HeadingText         string       `json:"heading_text,omitempty"`
	ImageDescription    string       `json:"image_description,omitempty"`
	ImageAltText        string       `json:"image_alt_text,omitempty"`
	ImageCaption        string       `json:"image_caption,omitempty"`
	QuizQuestion        string       `json:"quiz_question,omitempty"`
	QuizOptions         []quizOption `json:"quiz_options,omitempty"`
	QuizCorrectAnswerID string       `json:"quiz_correct_answer_id,omitempty"`
	QuizExplanation     string       `json:"quiz_explanation,omitempty"`
}

type quizOption struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// toContentJSON converts flat component fields to nested contentJSON format for storage
func (c *flatLessonComponent) toContentJSON() (string, error) {
	var content map[string]any

	switch c.ComponentType {
	case "text":
		content = map[string]any{
			"html":      c.TextHTML,
			"plaintext": stripHTML(c.TextHTML),
		}
	case "heading":
		content = map[string]any{
			"level": c.HeadingLevel,
			"text":  c.HeadingText,
		}
	case "image":
		content = map[string]any{
			"image_description": c.ImageDescription,
			"alt_text":          c.ImageAltText,
			"caption":           c.ImageCaption,
		}
	case "quiz":
		options := make([]map[string]string, len(c.QuizOptions))
		for i, opt := range c.QuizOptions {
			options[i] = map[string]string{"id": opt.ID, "text": opt.Text}
		}
		content = map[string]any{
			"question":          c.QuizQuestion,
			"question_type":     "multiple_choice",
			"options":           options,
			"correct_answer_id": c.QuizCorrectAnswerID,
			"explanation":       c.QuizExplanation,
		}
	default:
		content = map[string]any{}
	}

	jsonBytes, err := json.Marshal(content)
	if err != nil {
		return "", err
	}
	return string(jsonBytes), nil
}

// SME processing types

type smeProcessingResponse struct {
	Summary string     `json:"summary"`
	Chunks  []smeChunk `json:"chunks"`
}

type smeChunk struct {
	Content        string   `json:"content"`
	Topic          string   `json:"topic"`
	Keywords       []string `json:"keywords"`
	RelevanceScore float32  `json:"relevance_score"`
}

// componentPosition tracks where a component is in the lesson
type componentPosition struct {
	Index   int
	Total   int
	IsFirst bool
	IsLast  bool
}
