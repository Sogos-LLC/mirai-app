#!/bin/bash

# Test all document extraction formats
# Usage: ./scripts/test-all-formats.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEST_FILES_DIR="$PROJECT_DIR/test-files"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

echo "========================================"
echo "Document Extraction Format Test Suite"
echo "========================================"
echo ""

# Build the extract tool first
echo "Building extract CLI tool..."
cd "$PROJECT_DIR"
if go build -o extract ./cmd/extract 2>/dev/null; then
    echo -e "${GREEN}Build successful${NC}"
else
    echo -e "${RED}Build failed${NC}"
    exit 1
fi
echo ""

echo "----------------------------------------"
echo "Testing Extractors"
echo "----------------------------------------"
echo ""

# Test files and their format names (space-separated pairs)
TEST_FILES="sample.txt:Plain_Text sample.md:Markdown sample.pdf:PDF sample.docx:Word_Document sample.pptx:PowerPoint sample.xlsx:Excel sample.html:HTML sample.epub:EPUB"

for pair in $TEST_FILES; do
    file="${pair%%:*}"
    format="${pair##*:}"
    format="${format//_/ }"  # Replace underscores with spaces
    filepath="$TEST_FILES_DIR/$file"

    printf "%-20s %-20s" "$file" "$format"

    if [ ! -f "$filepath" ]; then
        echo -e " ${YELLOW}SKIPPED${NC} (file not found)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    # Run extraction and capture output
    if output=$("$PROJECT_DIR/extract" "$filepath" 2>&1); then
        # Check if output contains expected fields
        if echo "$output" | grep -q "Title:" && echo "$output" | grep -q "Section Count:"; then
            echo -e " ${GREEN}PASSED${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e " ${RED}FAILED${NC} (unexpected output format)"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e " ${RED}FAILED${NC}"
        echo "  Error: $output"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "----------------------------------------"
echo "Testing Chunker"
echo "----------------------------------------"
echo ""

# Build the chunk tool
echo "Building chunk CLI tool..."
if go build -o chunk ./cmd/chunk 2>/dev/null; then
    echo -e "${GREEN}Build successful${NC}"
else
    echo -e "${RED}Build failed${NC}"
    exit 1
fi
echo ""

# Test chunking with sample text
printf "%-40s" "Chunking extracted text..."
if output=$("$PROJECT_DIR/extract" "$TEST_FILES_DIR/sample.md" 2>/dev/null | "$PROJECT_DIR/chunk" --stats 2>&1); then
    if echo "$output" | grep -q "Chunk Count:"; then
        echo -e " ${GREEN}PASSED${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e " ${RED}FAILED${NC} (no chunks produced)"
        FAILED=$((FAILED + 1))
    fi
else
    echo -e " ${RED}FAILED${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "----------------------------------------"
echo "Running Go Tests"
echo "----------------------------------------"
echo ""

if go test ./... -v 2>&1 | tee /tmp/test-output.txt | grep -E "^(ok|FAIL|---)" ; then
    if grep -q "^FAIL" /tmp/test-output.txt; then
        echo -e "${RED}Some tests failed${NC}"
        FAILED=$((FAILED + 1))
    else
        echo -e "${GREEN}All tests passed${NC}"
        PASSED=$((PASSED + 1))
    fi
else
    echo -e "${RED}Test execution failed${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "========================================"
echo "Summary"
echo "========================================"
echo -e "${GREEN}Passed:${NC}  $PASSED"
echo -e "${RED}Failed:${NC}  $FAILED"
echo -e "${YELLOW}Skipped:${NC} $SKIPPED"
echo ""

# Cleanup
rm -f "$PROJECT_DIR/extract" "$PROJECT_DIR/chunk"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
