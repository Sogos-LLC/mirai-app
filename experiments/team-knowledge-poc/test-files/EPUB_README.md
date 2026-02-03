# EPUB Test File

A real EPUB file is needed for testing the EPUB extractor. You can:

## Option 1: Download a free EPUB
Download a public domain book from:
- Project Gutenberg: https://www.gutenberg.org/ (select EPUB format)
- Standard Ebooks: https://standardebooks.org/

## Option 2: Create a minimal EPUB manually

An EPUB is a ZIP archive with this structure:
```
sample.epub (ZIP archive)
├── mimetype               (plain text: "application/epub+zip", no compression)
├── META-INF/
│   └── container.xml      (points to content.opf)
├── OEBPS/
│   ├── content.opf        (manifest and spine)
│   ├── chapter1.xhtml     (actual content)
│   └── chapter2.xhtml     (actual content)
```

### Creating a minimal EPUB:

1. Create the directory structure and files
2. ZIP with: `zip -X0 sample.epub mimetype && zip -Xr9D sample.epub META-INF OEBPS`

## Option 3: Use the helper script

Run the following to create a minimal test EPUB:

```bash
cd test-files
mkdir -p epub-temp/META-INF epub-temp/OEBPS

# Create mimetype file (MUST be first in archive, uncompressed)
echo -n "application/epub+zip" > epub-temp/mimetype

# Create container.xml
cat > epub-temp/META-INF/container.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
EOF

# Create content.opf
cat > epub-temp/OEBPS/content.opf << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Sample EPUB Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:identifier id="uid">test-epub-001</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
  </spine>
</package>
EOF

# Create chapter1.xhtml
cat > epub-temp/OEBPS/chapter1.xhtml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Chapter 1: Getting Started</title>
</head>
<body>
  <h1>Chapter 1: Getting Started</h1>
  <p>Welcome to this sample EPUB book. This chapter introduces the basic concepts.</p>
  <p>EPUB files are simply ZIP archives containing XHTML content and metadata files.</p>
</body>
</html>
EOF

# Create chapter2.xhtml
cat > epub-temp/OEBPS/chapter2.xhtml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Chapter 2: Advanced Topics</title>
</head>
<body>
  <h1>Chapter 2: Advanced Topics</h1>
  <p>This chapter covers advanced topics including styling and navigation.</p>
  <p>Modern EPUB readers support CSS styling and interactive elements.</p>
</body>
</html>
EOF

# Create the EPUB (mimetype must be first and uncompressed)
cd epub-temp
zip -X0 ../sample.epub mimetype
zip -Xr9D ../sample.epub META-INF OEBPS
cd ..

# Cleanup
rm -rf epub-temp
```

The resulting `sample.epub` file can be used for testing the EPUB extractor.
