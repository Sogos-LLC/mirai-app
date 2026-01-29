package gemini

import (
	"encoding/json"
	"fmt"
)

func parseQuoteComponent(responseText string) (string, string) {
	var resp singleQuoteComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	// Frontend expects 'author' not 'attribution'
	content := map[string]any{
		"text":   resp.Text,
		"author": resp.Attribution,
	}
	jsonBytes, _ := json.Marshal(content)
	// Summary: first 40 chars of quote
	summary := fmt.Sprintf("Quote: \"%s\"", resp.Text)
	if len(resp.Text) > 40 {
		summary = fmt.Sprintf("Quote: \"%s...\"", resp.Text[:40])
	}
	return string(jsonBytes), summary
}

func parseListComponent(responseText string) (string, string) {
	var resp singleListComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	// Keep style as string - frontend expects string, not number
	items := make([]map[string]any, len(resp.Items))
	for i, item := range resp.Items {
		itemMap := map[string]any{"text": item.Text}
		// Include description for accordion items
		if item.Description != "" {
			itemMap["description"] = item.Description
		}
		items[i] = itemMap
	}
	content := map[string]any{
		"style": resp.Style,
		"items": items,
	}
	// Only include title if not empty
	if resp.Title != "" {
		content["title"] = resp.Title
	}
	jsonBytes, _ := json.Marshal(content)
	summary := fmt.Sprintf("List (%s): %d items", resp.Style, len(resp.Items))
	return string(jsonBytes), summary
}

func parseGalleryComponent(responseText string) (string, string) {
	var resp singleGalleryComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	// Keep style as string, use 'items' not 'images', use camelCase field names
	items := make([]map[string]any, len(resp.Images))
	for i, img := range resp.Images {
		items[i] = map[string]any{
			"imageDescription": img.Description,
			"altText":          img.AltText,
			"caption":          img.Caption,
		}
	}
	content := map[string]any{
		"style": resp.Style,
		"items": items,
	}
	jsonBytes, _ := json.Marshal(content)
	summary := fmt.Sprintf("Gallery (%s): %d images", resp.Style, len(resp.Images))
	return string(jsonBytes), summary
}

func parseMultimediaComponent(responseText string) (string, string) {
	var resp singleMultimediaComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	// Keep type as string, add url/title/isPlaceholder for frontend
	content := map[string]any{
		"type":          resp.MediaType,
		"url":           "",               // Empty URL - placeholder for user to fill
		"title":         resp.Description, // Use description as title
		"description":   resp.Description,
		"isPlaceholder": true, // AI-generated content is always a placeholder
	}
	jsonBytes, _ := json.Marshal(content)
	summary := fmt.Sprintf("Multimedia (%s)", resp.MediaType)
	return string(jsonBytes), summary
}

func parseChartComponent(responseText string) (string, string) {
	var resp singleChartComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	// Keep type as string, convert labels/values to series format
	dataPoints := make([]map[string]any, len(resp.Labels))
	for i := range resp.Labels {
		value := 0.0
		if i < len(resp.Values) {
			value = resp.Values[i]
		}
		dataPoints[i] = map[string]any{
			"label": resp.Labels[i],
			"value": value,
		}
	}
	content := map[string]any{
		"type":  resp.ChartType,
		"title": resp.Title,
		"series": []map[string]any{
			{
				"name": "Data",
				"data": dataPoints,
			},
		},
	}
	jsonBytes, _ := json.Marshal(content)
	summary := fmt.Sprintf("Chart (%s): %s", resp.ChartType, resp.Title)
	return string(jsonBytes), summary
}

func parseDividerComponent(responseText string) (string, string) {
	var resp singleDividerComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		// Divider may return empty object, that's OK
		resp = singleDividerComponent{Style: "line"}
	}
	content := map[string]any{
		"style": resp.Style,
	}
	jsonBytes, _ := json.Marshal(content)
	return string(jsonBytes), "Divider"
}
