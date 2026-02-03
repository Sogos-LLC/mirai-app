//go:build ignore
// +build ignore

// This program creates minimal valid Office test files for testing extractors.
// Run with: go run create_office_test_files.go
package main

import (
	"archive/zip"
	"fmt"
	"os"
	"path/filepath"

	"github.com/xuri/excelize/v2"
)

func main() {
	// Find the test-files directory relative to the current working directory
	// or use the directory containing this script
	dir, _ := os.Getwd()

	// Check if we're in the project root or test-files directory
	if _, err := os.Stat(filepath.Join(dir, "test-files")); err == nil {
		dir = filepath.Join(dir, "test-files")
	} else if _, err := os.Stat(filepath.Join(dir, "sample.md")); err != nil {
		// We're somewhere else, try to find test-files
		// For `go run test-files/create_office_test_files.go`, we're in project root
		fmt.Printf("Warning: Could not locate test-files directory, creating in: %s\n", dir)
	}

	fmt.Printf("Creating test Office files in %s...\n", dir)

	if err := createDOCX(filepath.Join(dir, "sample.docx")); err != nil {
		fmt.Printf("Error creating DOCX: %v\n", err)
	} else {
		fmt.Println("Created sample.docx")
	}

	if err := createPPTX(filepath.Join(dir, "sample.pptx")); err != nil {
		fmt.Printf("Error creating PPTX: %v\n", err)
	} else {
		fmt.Println("Created sample.pptx")
	}

	if err := createXLSX(filepath.Join(dir, "sample.xlsx")); err != nil {
		fmt.Printf("Error creating XLSX: %v\n", err)
	} else {
		fmt.Println("Created sample.xlsx")
	}

	fmt.Println("Done!")
}

// createDOCX creates a minimal valid DOCX file with headings and paragraphs
func createDOCX(filename string) error {
	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	// [Content_Types].xml - required for DOCX
	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
	writeZipFile(w, "[Content_Types].xml", contentTypes)

	// _rels/.rels - required relationships
	rels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
	writeZipFile(w, "_rels/.rels", rels)

	// word/_rels/document.xml.rels - document relationships
	docRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
	writeZipFile(w, "word/_rels/document.xml.rels", docRels)

	// word/document.xml - the actual document content
	documentXML := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Introduction to Document Extraction</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>This is a sample Word document created for testing the DOCX extractor. It contains multiple paragraphs and headings to verify that the extraction process works correctly.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Key Features</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The extractor can identify heading styles and separate content into logical sections. This helps with structured extraction of document content.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Conclusion</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Document extraction is an essential capability for processing knowledge bases and team documentation.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`
	writeZipFile(w, "word/document.xml", documentXML)

	return nil
}

// createPPTX creates a minimal valid PPTX file with slides
func createPPTX(filename string) error {
	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	// [Content_Types].xml
	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
	writeZipFile(w, "[Content_Types].xml", contentTypes)

	// _rels/.rels
	rels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
	writeZipFile(w, "_rels/.rels", rels)

	// ppt/_rels/presentation.xml.rels
	presRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
</Relationships>`
	writeZipFile(w, "ppt/_rels/presentation.xml.rels", presRels)

	// ppt/presentation.xml
	presentation := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
    <p:sldId id="258" r:id="rId3"/>
  </p:sldIdLst>
</p:presentation>`
	writeZipFile(w, "ppt/presentation.xml", presentation)

	// Slide 1 - Title slide
	slide1 := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="1" name="Title"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="ctrTitle"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>Team Knowledge Management</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Subtitle"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="subTitle"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>A presentation about document extraction</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
	writeZipFile(w, "ppt/slides/slide1.xml", slide1)

	// Slide 2 - Content slide
	slide2 := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="1" name="Title"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>Why Extract Documents?</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Content"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="body"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>Enable AI-powered search and retrieval</a:t></a:r></a:p>
          <a:p><a:r><a:t>Create semantic embeddings for RAG</a:t></a:r></a:p>
          <a:p><a:r><a:t>Build knowledge graphs from documents</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
	writeZipFile(w, "ppt/slides/slide2.xml", slide2)

	// Slide 3 - Summary slide
	slide3 := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="1" name="Title"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>Next Steps</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Content"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="body"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:p><a:r><a:t>Implement chunking strategies</a:t></a:r></a:p>
          <a:p><a:r><a:t>Add metadata extraction</a:t></a:r></a:p>
          <a:p><a:r><a:t>Integrate with vector database</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
	writeZipFile(w, "ppt/slides/slide3.xml", slide3)

	return nil
}

// createXLSX creates a sample Excel file using excelize
func createXLSX(filename string) error {
	f := excelize.NewFile()
	defer f.Close()

	// Sheet 1: Project Data
	f.SetSheetName("Sheet1", "Project Data")
	f.SetCellValue("Project Data", "A1", "Project Name")
	f.SetCellValue("Project Data", "B1", "Status")
	f.SetCellValue("Project Data", "C1", "Priority")
	f.SetCellValue("Project Data", "D1", "Owner")

	f.SetCellValue("Project Data", "A2", "Document Extraction")
	f.SetCellValue("Project Data", "B2", "In Progress")
	f.SetCellValue("Project Data", "C2", "High")
	f.SetCellValue("Project Data", "D2", "Team Alpha")

	f.SetCellValue("Project Data", "A3", "Vector Database")
	f.SetCellValue("Project Data", "B3", "Planning")
	f.SetCellValue("Project Data", "C3", "Medium")
	f.SetCellValue("Project Data", "D3", "Team Beta")

	f.SetCellValue("Project Data", "A4", "RAG Pipeline")
	f.SetCellValue("Project Data", "B4", "Not Started")
	f.SetCellValue("Project Data", "C4", "High")
	f.SetCellValue("Project Data", "D4", "Team Alpha")

	// Sheet 2: Team Members
	f.NewSheet("Team Members")
	f.SetCellValue("Team Members", "A1", "Name")
	f.SetCellValue("Team Members", "B1", "Role")
	f.SetCellValue("Team Members", "C1", "Email")

	f.SetCellValue("Team Members", "A2", "Alice Smith")
	f.SetCellValue("Team Members", "B2", "Lead Developer")
	f.SetCellValue("Team Members", "C2", "alice@example.com")

	f.SetCellValue("Team Members", "A3", "Bob Johnson")
	f.SetCellValue("Team Members", "B3", "Backend Engineer")
	f.SetCellValue("Team Members", "C3", "bob@example.com")

	f.SetCellValue("Team Members", "A4", "Carol Williams")
	f.SetCellValue("Team Members", "B4", "ML Engineer")
	f.SetCellValue("Team Members", "C4", "carol@example.com")

	// Sheet 3: Metrics
	f.NewSheet("Metrics")
	f.SetCellValue("Metrics", "A1", "Metric")
	f.SetCellValue("Metrics", "B1", "Value")
	f.SetCellValue("Metrics", "C1", "Unit")

	f.SetCellValue("Metrics", "A2", "Documents Processed")
	f.SetCellValue("Metrics", "B2", 1500)
	f.SetCellValue("Metrics", "C2", "count")

	f.SetCellValue("Metrics", "A3", "Average Extraction Time")
	f.SetCellValue("Metrics", "B3", 2.5)
	f.SetCellValue("Metrics", "C3", "seconds")

	f.SetCellValue("Metrics", "A4", "Success Rate")
	f.SetCellValue("Metrics", "B4", 98.5)
	f.SetCellValue("Metrics", "C4", "percent")

	return f.SaveAs(filename)
}

func writeZipFile(w *zip.Writer, name, content string) error {
	f, err := w.Create(name)
	if err != nil {
		return err
	}
	_, err = f.Write([]byte(content))
	return err
}
