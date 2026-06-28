#!/bin/bash
# package-extension.sh — Creates a clean ZIP for Chrome Web Store submission

EXTENSION_NAME="markbuddy"
VERSION=$(node -p "require('./manifest.json').version")
OUTPUT="${EXTENSION_NAME}-v${VERSION}.zip"

# Remove old package
rm -f "$OUTPUT"

echo "Packaging MarkBuddy extension v${VERSION}..."

# Create ZIP excluding dev files and temporary folders
zip -r "$OUTPUT" . \
  -x ".git/*" \
  -x ".gitignore" \
  -x "node_modules/*" \
  -x "*.zip" \
  -x "chrome-profile/*" \
  -x "docs/*" \
  -x "CHROMEWEBSTORE.md" \
  -x "package-extension.sh" \
  -x ".DS_Store" \
  -x "Thumbs.db"

echo "----------------------------------------"
echo "Packaged successfully: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "----------------------------------------"
