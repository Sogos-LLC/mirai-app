package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

func buildSectionsOnlyPrompt(req service.GenerateOutlineRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating a course outline.\n\n")
	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n", req.TargetAudience.ExperienceLevel))
	if len(req.TargetAudience.LearningGoals) > 0 {
		sb.WriteString(fmt.Sprintf("**Learning Goals:** %s\n", strings.Join(req.TargetAudience.LearningGoals, ", ")))
	}
	if len(req.TargetAudience.Prerequisites) > 0 {
		sb.WriteString(fmt.Sprintf("**Prerequisites:** %s\n", strings.Join(req.TargetAudience.Prerequisites, ", ")))
	}
	if len(req.TargetAudience.Challenges) > 0 {
		sb.WriteString(fmt.Sprintf("**Challenges:** %s\n", strings.Join(req.TargetAudience.Challenges, ", ")))
	}
	if req.TargetAudience.IndustryContext != "" {
		sb.WriteString(fmt.Sprintf("**Industry Context:** %s\n", req.TargetAudience.IndustryContext))
	}
	sb.WriteString("\n")

	sb.WriteString("## Subject Matter Expert Knowledge\n")
	for _, sme := range req.SMEKnowledge {
		sb.WriteString(fmt.Sprintf("\n### %s (%s)\n", sme.SMEName, sme.Domain))
		if sme.Summary != "" {
			sb.WriteString(fmt.Sprintf("**Summary:** %s\n", sme.Summary))
		}
		if len(sme.Keywords) > 0 {
			sb.WriteString(fmt.Sprintf("**Key Topics:** %s\n", strings.Join(sme.Keywords, ", ")))
		}
		for i, chunk := range sme.Chunks {
			if i < 5 {
				sb.WriteString(fmt.Sprintf("\n%s\n", chunk))
			}
		}
	}
	sb.WriteString("\n")

	if req.AdditionalContext != "" {
		sb.WriteString("## Additional Context\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("Create a high-level course outline with sections and lesson titles.\n")
	sb.WriteString("Each section should have a clear theme and 2-5 lessons.\n")
	sb.WriteString("For each section, provide the section title, description, and a list of lesson titles.\n")
	sb.WriteString("Ensure content flows logically and builds on previous sections.\n")

	return sb.String()
}

func buildSectionLessonsPrompt(req service.GenerateOutlineRequest, sectionTitle, sectionDescription string, lessonTitles []string) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating detailed lesson plans.\n\n")
	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Course Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	sb.WriteString("## Current Section\n")
	sb.WriteString(fmt.Sprintf("**Section Title:** %s\n", sectionTitle))
	sb.WriteString(fmt.Sprintf("**Section Description:** %s\n\n", sectionDescription))

	sb.WriteString("## Lesson Titles to Expand\n")
	for i, title := range lessonTitles {
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, title))
	}
	sb.WriteString("\n")

	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n", req.TargetAudience.ExperienceLevel))
	if len(req.TargetAudience.Challenges) > 0 {
		sb.WriteString(fmt.Sprintf("**Challenges:** %s\n", strings.Join(req.TargetAudience.Challenges, ", ")))
	}
	sb.WriteString("\n")

	if len(req.SMEKnowledge) > 0 {
		sb.WriteString("## Subject Matter Expert Knowledge (Summary)\n")
		for _, sme := range req.SMEKnowledge {
			if sme.Summary != "" {
				sb.WriteString(fmt.Sprintf("**%s (%s):** %s\n", sme.SMEName, sme.Domain, sme.Summary))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("For each lesson title provided above, create detailed lesson information:\n")
	sb.WriteString("- Keep the original title or improve it slightly\n")
	sb.WriteString("- Write a brief description of what the lesson covers\n")
	sb.WriteString("- Estimate duration (5-20 minutes)\n")
	sb.WriteString("- Include 2-4 specific, measurable learning objectives\n")
	sb.WriteString("- Ensure lessons flow logically within the section\n")

	return sb.String()
}
