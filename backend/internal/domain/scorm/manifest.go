package scorm

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
)

// Manifest represents the imsmanifest.xml structure for SCORM 2004 3rd Edition.
type Manifest struct {
	XMLName      xml.Name     `xml:"manifest"`
	Identifier   string       `xml:"identifier,attr"`
	Version      string       `xml:"version,attr"`
	XMLNS        string       `xml:"xmlns,attr"`
	ADLCP        string       `xml:"xmlns:adlcp,attr"`
	ADLSEQ       string       `xml:"xmlns:adlseq,attr"`
	ADLNAV       string       `xml:"xmlns:adlnav,attr"`
	IMSSS        string       `xml:"xmlns:imsss,attr"`
	XSI          string       `xml:"xmlns:xsi,attr"`
	Metadata     Metadata     `xml:"metadata"`
	Organizations Organizations `xml:"organizations"`
	Resources    Resources    `xml:"resources"`
}

// Metadata contains schema information.
type Metadata struct {
	Schema        string `xml:"schema"`
	SchemaVersion string `xml:"schemaversion"`
}

// Organizations contains the course organization structure.
type Organizations struct {
	Default string       `xml:"default,attr"`
	Org     Organization `xml:"organization"`
}

// Organization represents a single organization (course structure).
type Organization struct {
	Identifier string           `xml:"identifier,attr"`
	Title      string           `xml:"title"`
	Items      []Item           `xml:"item"`
	Sequencing *OrgSequencing   `xml:"imsss:sequencing,omitempty"`
}

// OrgSequencing defines sequencing rules at the organization level.
type OrgSequencing struct {
	ControlMode *ControlMode `xml:"imsss:controlMode,omitempty"`
}

// ControlMode defines navigation control options.
type ControlMode struct {
	Choice     bool `xml:"choice,attr"`
	Flow       bool `xml:"flow,attr"`
	ChoiceExit bool `xml:"choiceExit,attr,omitempty"`
}

// Item represents an activity in the organization tree.
type Item struct {
	Identifier    string        `xml:"identifier,attr"`
	IdentifierRef string        `xml:"identifierref,attr,omitempty"`
	Title         string        `xml:"title"`
	Items         []Item        `xml:"item,omitempty"`
	Sequencing    *ItemSequencing `xml:"imsss:sequencing,omitempty"`
}

// ItemSequencing defines sequencing rules for an item.
type ItemSequencing struct {
	Objectives       *Objectives       `xml:"imsss:objectives,omitempty"`
	DeliveryControls *DeliveryControls `xml:"imsss:deliveryControls,omitempty"`
	SequencingRules  *SequencingRules  `xml:"imsss:sequencingRules,omitempty"`
}

// Objectives defines learning objectives for tracking.
type Objectives struct {
	Primary     *PrimaryObjective   `xml:"imsss:primaryObjective,omitempty"`
	Objectives  []SecondaryObjective `xml:"imsss:objective,omitempty"`
}

// PrimaryObjective is the main objective for an activity.
type PrimaryObjective struct {
	ObjectiveID        string    `xml:"objectiveID,attr"`
	SatisfiedByMeasure bool      `xml:"satisfiedByMeasure,attr,omitempty"`
	MinMeasure         string    `xml:"imsss:minNormalizedMeasure,omitempty"`
	MapInfo            []MapInfo `xml:"imsss:mapInfo,omitempty"`
}

// SecondaryObjective is used for prerequisites.
type SecondaryObjective struct {
	ObjectiveID string    `xml:"objectiveID,attr"`
	MapInfo     []MapInfo `xml:"imsss:mapInfo,omitempty"`
}

// MapInfo maps local objectives to global objectives.
type MapInfo struct {
	TargetObjectiveID    string `xml:"targetObjectiveID,attr"`
	WriteSatisfiedStatus bool   `xml:"writeSatisfiedStatus,attr,omitempty"`
	ReadSatisfiedStatus  bool   `xml:"readSatisfiedStatus,attr,omitempty"`
}

// DeliveryControls specifies how completion is determined.
type DeliveryControls struct {
	CompletionSetByContent bool `xml:"completionSetByContent,attr"`
	ObjectiveSetByContent  bool `xml:"objectiveSetByContent,attr"`
}

// SequencingRules defines precondition rules.
type SequencingRules struct {
	PreConditionRules []PreConditionRule `xml:"imsss:preConditionRule,omitempty"`
}

// PreConditionRule defines a precondition for activity access.
type PreConditionRule struct {
	Conditions RuleConditions `xml:"imsss:ruleConditions"`
	Action     RuleAction     `xml:"imsss:ruleAction"`
}

// RuleConditions contains the conditions to evaluate.
type RuleConditions struct {
	Combination string          `xml:"conditionCombination,attr,omitempty"`
	Conditions  []RuleCondition `xml:"imsss:ruleCondition"`
}

// RuleCondition is a single condition.
type RuleCondition struct {
	RefObjective string `xml:"referencedObjective,attr"`
	Condition    string `xml:"condition,attr"`
	Operator     string `xml:"operator,attr,omitempty"`
}

// RuleAction is the action to take when conditions are met.
type RuleAction struct {
	Action string `xml:"action,attr"`
}

// Resources contains all resource definitions.
type Resources struct {
	Resources []Resource `xml:"resource"`
}

// Resource represents a launchable resource (SCO or asset).
type Resource struct {
	Identifier   string       `xml:"identifier,attr"`
	Type         string       `xml:"type,attr"`
	SCORMType    string       `xml:"adlcp:scormType,attr"`
	Href         string       `xml:"href,attr,omitempty"`
	Files        []File       `xml:"file,omitempty"`
	Dependencies []Dependency `xml:"dependency,omitempty"`
}

// File references a file in the package.
type File struct {
	Href string `xml:"href,attr"`
}

// Dependency references another resource.
type Dependency struct {
	IdentifierRef string `xml:"identifierref,attr"`
}

// GenerateManifest creates the imsmanifest.xml content for a course.
func GenerateManifest(data CourseData) ([]byte, error) {
	manifest := Manifest{
		Identifier:   fmt.Sprintf("com.mirai.course.%s", sanitizeID(data.ID)),
		Version:      "1",
		XMLNS:        "http://www.imsglobal.org/xsd/imscp_v1p1",
		ADLCP:        "http://www.adlnet.org/xsd/adlcp_v1p3",
		ADLSEQ:       "http://www.adlnet.org/xsd/adlseq_v1p3",
		ADLNAV:       "http://www.adlnet.org/xsd/adlnav_v1p3",
		IMSSS:        "http://www.imsglobal.org/xsd/imsss",
		XSI:          "http://www.w3.org/2001/XMLSchema-instance",
		Metadata: Metadata{
			Schema:        "ADL SCORM",
			SchemaVersion: "2004 3rd Edition",
		},
	}

	// Build organization structure
	org := Organization{
		Identifier: "course_org",
		Title:      data.Title,
		Sequencing: &OrgSequencing{
			ControlMode: &ControlMode{
				Choice:     true,
				Flow:       true,
				ChoiceExit: true,
			},
		},
	}

	var resources []Resource

	// Add shared assets resource
	sharedResource := Resource{
		Identifier: "shared_assets",
		Type:       "webcontent",
		SCORMType:  "asset",
		Files: []File{
			{Href: "js/scorm-api.js"},
			{Href: "css/styles.css"},
		},
	}
	resources = append(resources, sharedResource)

	// Build items and resources for each section/lesson
	var prevLessonObjID string
	for sIdx, section := range data.Sections {
		sectionItem := Item{
			Identifier: fmt.Sprintf("section_%d", sIdx+1),
			Title:      section.Title,
		}

		for lIdx, lesson := range section.Lessons {
			lessonID := fmt.Sprintf("lesson_%s", sanitizeID(lesson.ID))
			resourceID := fmt.Sprintf("sco_%s", sanitizeID(lesson.ID))
			objectiveID := fmt.Sprintf("obj_%s", sanitizeID(lesson.ID))
			globalObjectiveID := fmt.Sprintf("global_%s_complete", sanitizeID(lesson.ID))

			lessonItem := Item{
				Identifier:    lessonID,
				IdentifierRef: resourceID,
				Title:         lesson.Title,
				Sequencing: &ItemSequencing{
					Objectives: &Objectives{
						Primary: &PrimaryObjective{
							ObjectiveID: objectiveID,
							MapInfo: []MapInfo{
								{
									TargetObjectiveID:    globalObjectiveID,
									WriteSatisfiedStatus: true,
								},
							},
						},
					},
					DeliveryControls: &DeliveryControls{
						CompletionSetByContent: true,
						ObjectiveSetByContent:  true,
					},
				},
			}

			// Add prerequisite rule if not the first lesson
			if prevLessonObjID != "" {
				prereqObjID := fmt.Sprintf("prereq_%s", sanitizeID(lesson.ID))
				lessonItem.Sequencing.Objectives.Objectives = append(
					lessonItem.Sequencing.Objectives.Objectives,
					SecondaryObjective{
						ObjectiveID: prereqObjID,
						MapInfo: []MapInfo{
							{
								TargetObjectiveID:   prevLessonObjID,
								ReadSatisfiedStatus: true,
							},
						},
					},
				)
				lessonItem.Sequencing.SequencingRules = &SequencingRules{
					PreConditionRules: []PreConditionRule{
						{
							Conditions: RuleConditions{
								Combination: "any",
								Conditions: []RuleCondition{
									{
										RefObjective: prereqObjID,
										Condition:    "satisfied",
										Operator:     "not",
									},
									{
										RefObjective: prereqObjID,
										Condition:    "objectiveStatusKnown",
										Operator:     "not",
									},
								},
							},
							Action: RuleAction{Action: "disabled"},
						},
					},
				}
			}

			sectionItem.Items = append(sectionItem.Items, lessonItem)
			prevLessonObjID = globalObjectiveID

			// Create resource for this lesson
			lessonPath := fmt.Sprintf("content/section-%d/lesson-%d.html", sIdx+1, lIdx+1)
			lessonResource := Resource{
				Identifier: resourceID,
				Type:       "webcontent",
				SCORMType:  "sco",
				Href:       lessonPath,
				Files: []File{
					{Href: lessonPath},
				},
				Dependencies: []Dependency{
					{IdentifierRef: "shared_assets"},
				},
			}
			resources = append(resources, lessonResource)
		}

		org.Items = append(org.Items, sectionItem)
	}

	manifest.Organizations = Organizations{
		Default: "course_org",
		Org:     org,
	}
	manifest.Resources = Resources{Resources: resources}

	// Generate XML with proper declaration
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")

	encoder := xml.NewEncoder(&buf)
	encoder.Indent("", "  ")
	if err := encoder.Encode(manifest); err != nil {
		return nil, fmt.Errorf("failed to encode manifest: %w", err)
	}

	return buf.Bytes(), nil
}

// sanitizeID removes characters that are invalid in XML identifiers.
func sanitizeID(id string) string {
	// Replace hyphens and other invalid chars with underscores
	result := strings.ReplaceAll(id, "-", "_")
	result = strings.ReplaceAll(result, " ", "_")
	// Ensure it starts with a letter if it starts with a number
	if len(result) > 0 && result[0] >= '0' && result[0] <= '9' {
		result = "id_" + result
	}
	return result
}
