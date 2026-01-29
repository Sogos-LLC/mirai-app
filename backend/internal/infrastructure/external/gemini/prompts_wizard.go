package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

func buildImprovedTitlePrompt(courseName string) string {
	return fmt.Sprintf(`You are an expert course designer who creates compelling course titles and descriptions.

## Original Course Name
%s

## Instructions
Based on the course name provided, create:

1. **Improved Title**: A polished, professional course title that:
   - Is clear and specific about what learners will learn
   - Is engaging and motivating
   - Uses proper capitalization (Title Case)
   - Is concise (typically 3-8 words)
   - Avoids jargon unless the topic requires it

2. **Description**: A compelling 2-3 sentence course description that:
   - Clearly states what the course covers
   - Highlights the key benefits for learners
   - Sets appropriate expectations for the content
   - Uses active, engaging language

Keep the improved title close to the original intent, but make it more professional and marketable.`, courseName)
}

func buildCourseOutcomesPrompt(courseName string) string {
	return buildCourseOutcomesPromptWithRAG(courseName, nil)
}

func buildCourseOutcomesPromptWithRAG(courseName string, ragContext []service.RAGChunk) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer who creates measurable learning outcomes for professional courses.\n\n")

	sb.WriteString("## Course Topic\n")
	sb.WriteString(courseName)
	sb.WriteString("\n\n")

	// Add RAG context if provided
	if len(ragContext) > 0 {
		sb.WriteString("## Reference Materials\n")
		sb.WriteString("The following content has been provided as reference material for this course. Use it to inform your learning outcomes:\n\n")
		for i, chunk := range ragContext {
			sb.WriteString(fmt.Sprintf("### Source %d: %s\n", i+1, chunk.SourceName))
			sb.WriteString(chunk.Content)
			sb.WriteString("\n\n")
		}
		sb.WriteString("---\n\n")
	}

	sb.WriteString(`## Instructions
Generate 3-5 clear, measurable learning outcomes for this course. Each outcome should:

1. Start with an action verb from Bloom's Taxonomy (e.g., Understand, Apply, Analyze, Create, Evaluate)
2. Be specific and measurable
3. Describe what the learner will be able to DO after completing the course
4. Be achievable within a typical course duration`)

	if len(ragContext) > 0 {
		sb.WriteString(`
5. Be informed by the reference materials provided above
6. Reflect the specific topics, concepts, and skills covered in the source materials`)
	}

	sb.WriteString(`

Format your response as bullet points, with each outcome on a new line starting with "• ".

Example format:
• Understand the fundamental concepts of [topic] and their applications
• Apply [skill] techniques to solve real-world problems
• Analyze [subject] scenarios and identify key patterns
• Create effective [deliverable] using industry best practices
• Evaluate [outcomes] and make data-driven decisions

Generate outcomes that are relevant, practical, and aligned with professional development goals.`)

	return sb.String()
}

func buildSMEPersonasPrompt(title, description string) string {
	return fmt.Sprintf(`You are an expert instructional designer creating subject matter expert (SME) personas for a course.

## Course Information
**Title:** %s
**Description:** %s

## Instructions
Generate 3 diverse SME personas who could teach this course. Each persona should:

1. Have a unique professional background and expertise angle
2. Bring different perspectives to the subject matter
3. Have distinct teaching styles that would appeal to different learners

Make the personas realistic and specific to the course topic. Consider:
- Different career paths that lead to expertise in this area
- Varying years of experience and specializations
- Different industries or contexts where this knowledge applies

The personas should complement each other, covering different aspects of the course material from different angles.`, title, description)
}

func buildAudiencePersonasPrompt(req service.GenerateAudiencePersonasRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating target audience personas for a course.\n\n")
	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.Title))
	sb.WriteString(fmt.Sprintf("**Description:** %s\n\n", req.Description))

	if len(req.SMEPersonas) > 0 {
		sb.WriteString("## Subject Matter Experts Teaching This Course\n")
		for _, sme := range req.SMEPersonas {
			sb.WriteString(fmt.Sprintf("- **%s**: %s\n", sme.JobTitle, sme.Description))
		}
		sb.WriteString("\n")
	}

	sb.WriteString(`## Instructions
Generate 3 diverse audience personas who would benefit from this course. Each persona should:

1. Have a distinct background and current role
2. Have different motivations for taking the course
3. Represent different experience levels (e.g., beginner, intermediate, career-changer)

Make the personas realistic and relatable. Consider:
- Different career stages (early career, mid-career, transitioning)
- Different industries or contexts
- Different learning goals and motivations
- What challenges they face that this course would address

Each persona should feel like a real person with specific goals and challenges.`)

	return sb.String()
}

func buildToneOptionsPrompt(req service.GenerateToneOptionsRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating tone and style options for a course.\n\n")
	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.Title))
	sb.WriteString(fmt.Sprintf("**Description:** %s\n\n", req.Description))

	if len(req.AudiencePersonas) > 0 {
		sb.WriteString("## Target Audience\n")
		for _, p := range req.AudiencePersonas {
			sb.WriteString(fmt.Sprintf("- **%s** (%s): %s\n", p.Name, p.Role, p.Description))
		}
		sb.WriteString("\n")
	}

	sb.WriteString(`## Instructions
Generate 3 distinct tone/style options for this course. Each option should:

1. Have a clear, descriptive name (e.g., "Quick Start Guide", "Deep Dive", "Hands-on Workshop")
2. Define a specific teaching approach and content depth
3. Match one of these detail levels:
   - "brief": Concise, focused on essentials, quick to complete
   - "moderate": Balanced coverage, includes examples and practice
   - "comprehensive": In-depth, thorough explanations, extensive practice

The options should offer meaningful variety:
- One focused on practical, quick application
- One balanced for general learning
- One thorough for deep understanding

Consider what tone would best serve the target audience's goals.`)

	return sb.String()
}
