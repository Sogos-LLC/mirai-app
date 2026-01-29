package gemini

// Wizard response types

type improvedTitleResponse struct {
	ImprovedTitle string `json:"improved_title"`
	Description   string `json:"description"`
}

type courseOutcomesResponse struct {
	Outcomes string `json:"outcomes"`
}

type smePersonasResponse struct {
	Personas []smePersonaItem `json:"personas"`
}

type smePersonaItem struct {
	ID          string   `json:"id"`
	JobTitle    string   `json:"job_title"`
	Description string   `json:"description"`
	Skills      []string `json:"skills"`
	Voice       string   `json:"voice"`
}

type audiencePersonasResponse struct {
	Personas []audiencePersonaItem `json:"personas"`
}

type audiencePersonaItem struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Description string   `json:"description"`
	Goals       []string `json:"goals"`
}

type toneOptionsResponse struct {
	Options []toneOptionItem `json:"options"`
}

type toneOptionItem struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	LevelOfDetail string `json:"level_of_detail"`
}
