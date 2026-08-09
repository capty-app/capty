#!/bin/bash

# Capty Local Release Script
# This script replicates the GitHub Actions release workflow for local execution
# 
# Required environment variables for notarization (set in .env.release or export):
#   APPLE_ID                    - Your Apple ID email
#   APPLE_APP_SPECIFIC_PASSWORD - App-specific password from Apple ID
#   APPLE_TEAM_ID               - Apple Developer Team ID
#
# Optional (only needed in CI, not on your local Mac with certs installed):
#   MACOS_CERTIFICATE           - Base64-encoded .p12 certificate
#   MACOS_CERTIFICATE_PWD       - Password for the .p12 certificate
#
# For GitHub release upload:
#   GH_TOKEN                    - GitHub token with release permissions
#
# For capty.app upload:
#   CAPTY_RELEASE_SECRET        - Secret for capty.app API
#
# Usage:
#   ./scripts/release.sh <version> [--no-notarize] [--skip-upload]
#
# Examples:
#   ./scripts/release.sh 1.1.0
#   ./scripts/release.sh 1.1.0 --no-notarize
#   ./scripts/release.sh 1.1.0 --skip-upload

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root
cd "$PROJECT_ROOT"

# Parse arguments
VERSION=""
NOTARIZE=true
SKIP_UPLOAD=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-notarize)
      NOTARIZE=false
      shift
      ;;
    --skip-upload)
      SKIP_UPLOAD=true
      shift
      ;;
    *)
      if [[ -z "$VERSION" ]]; then
        VERSION="$1"
      fi
      shift
      ;;
  esac
done

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment variables from .env.release if it exists
if [[ -f "$PROJECT_ROOT/.env.release" ]]; then
  log_info "Loading environment from .env.release"
  set -a
  source "$PROJECT_ROOT/.env.release"
  set +a
fi

# Validate version format
if [[ -z "$VERSION" ]]; then
  log_error "Version is required"
  echo "Usage: $0 <version> [--no-notarize] [--skip-upload]"
  echo "Example: $0 1.1.0"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  log_error "Version must be in format X.Y.Z (e.g., 1.1.0)"
  exit 1
fi

log_info "Starting release process for version $VERSION"
echo ""

# Check required environment variables for notarization
if [[ "$NOTARIZE" == "true" ]]; then
  log_info "Checking notarization requirements..."

  MISSING_VARS=()
  [[ -z "$APPLE_ID" ]] && MISSING_VARS+=("APPLE_ID")
  [[ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]] && MISSING_VARS+=("APPLE_APP_SPECIFIC_PASSWORD")
  [[ -z "$APPLE_TEAM_ID" ]] && MISSING_VARS+=("APPLE_TEAM_ID")

  if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    log_error "Missing required environment variables for notarization:"
    for var in "${MISSING_VARS[@]}"; do
      echo "  - $var"
    done
    echo ""
    echo "Set these in .env.release or export them manually."
    echo "Or run with --no-notarize to skip notarization."
    exit 1
  fi

  log_success "Notarization credentials found"
fi

# Check GitHub token for upload
if [[ "$SKIP_UPLOAD" == "false" ]]; then
  if [[ -z "$GH_TOKEN" ]]; then
    log_warning "GH_TOKEN not set - GitHub release upload will be skipped"
    SKIP_UPLOAD=true
  fi
fi

# Define artifact paths
DMG_PATH="release/${VERSION}/Capty-${VERSION}-universal.dmg"
ZIP_PATH="release/${VERSION}/Capty-${VERSION}-universal-mac.zip"
DMG_NAME="Capty-${VERSION}-universal.dmg"
ZIP_NAME="Capty-${VERSION}-universal-mac.zip"

# Step 1: Install dependencies
log_info "Step 1: Installing dependencies..."
bun install
log_success "Dependencies installed"
echo ""

# Step 2: Update package.json version
log_info "Step 2: Updating package.json version to $VERSION..."
jq --arg v "$VERSION" '.version = $v' package.json > package.json.tmp
mv package.json.tmp package.json
log_success "Version updated in package.json"
echo ""

# Step 3: Commit version update
log_info "Step 3: Committing version update..."
git add package.json
git commit -m "chore: bump version to $VERSION" || log_warning "Nothing to commit (version may already be set)"
git push || log_warning "Failed to push (you may need to push manually)"
log_success "Version commit created"
echo ""

# Step 4: Create and push tag
log_info "Step 4: Creating and pushing tag v$VERSION..."
git tag "v$VERSION" 2>/dev/null || log_warning "Tag v$VERSION already exists"
git push origin "v$VERSION" 2>/dev/null || log_warning "Tag may already exist on remote"
log_success "Tag created"
echo ""

# Step 5: Generate release notes
log_info "Step 5: Generating release notes..."

# Get the previous tag
PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

if [[ -z "$PREVIOUS_TAG" ]]; then
  COMMITS=$(git log --pretty=format:"%s" --no-merges)
else
  COMMITS=$(git log ${PREVIOUS_TAG}..HEAD --pretty=format:"%s" --no-merges)
fi

FEATURES=""
FIXES=""
INTERNAL=""

while IFS= read -r commit; do
  # Skip empty lines
  if [[ -z "$commit" ]]; then
    continue
  fi

  # Check for feature commits
  if echo "$commit" | grep -qiE "^feat(\(.*\))?:"; then
    MSG=$(echo "$commit" | sed -E 's/^feat(\([^)]*\))?:[[:space:]]*//')
    MSG="$(echo "${MSG:0:1}" | tr '[:lower:]' '[:upper:]')${MSG:1}"
    FEATURES="${FEATURES}- ${MSG}\n"
  # Check for fix commits
  elif echo "$commit" | grep -qiE "^fix(\(.*\))?:"; then
    MSG=$(echo "$commit" | sed -E 's/^fix(\([^)]*\))?:[[:space:]]*//')
    MSG="$(echo "${MSG:0:1}" | tr '[:lower:]' '[:upper:]')${MSG:1}"
    FIXES="${FIXES}- ${MSG}\n"
  # Collect internal commits (chore, refactor, docs, internal, tech-debt, etc.)
  else
    # Remove common prefixes: chore, refactor, docs, internal, tech-debt, style, test, ci, build, perf
    MSG=$(echo "$commit" | sed -E 's/^(chore|refactor|docs|internal|tech-debt|style|test|ci|build|perf)(\([^)]*\))?:[[:space:]]*//')
    MSG="$(echo "${MSG:0:1}" | tr '[:lower:]' '[:upper:]')${MSG:1}"
    INTERNAL="${INTERNAL}- ${MSG}\n"
  fi
done <<< "$COMMITS"

# Build the release notes (public)
RELEASE_NOTES=""

if [[ -n "$FEATURES" ]]; then
  RELEASE_NOTES="${RELEASE_NOTES}## Features\n${FEATURES}"
fi

if [[ -n "$FIXES" ]]; then
  if [[ -n "$RELEASE_NOTES" ]]; then
    RELEASE_NOTES="${RELEASE_NOTES}\n"
  fi
  RELEASE_NOTES="${RELEASE_NOTES}## Bug Fixes\n${FIXES}"
fi

# If no features or fixes, provide default message
if [[ -z "$RELEASE_NOTES" ]]; then
  RELEASE_NOTES="No changelog provided"
fi

RELEASE_NOTES=$(echo -e "$RELEASE_NOTES" | sed 's/\\n$//')
echo -e "$RELEASE_NOTES" > release_notes.txt

# Build the internal release notes (includes all sections)
INTERNAL_RELEASE_NOTES=""

if [[ -n "$FEATURES" ]]; then
  INTERNAL_RELEASE_NOTES="${INTERNAL_RELEASE_NOTES}## Features\n${FEATURES}"
fi

if [[ -n "$FIXES" ]]; then
  if [[ -n "$INTERNAL_RELEASE_NOTES" ]]; then
    INTERNAL_RELEASE_NOTES="${INTERNAL_RELEASE_NOTES}\n"
  fi
  INTERNAL_RELEASE_NOTES="${INTERNAL_RELEASE_NOTES}## Bug Fixes\n${FIXES}"
fi

if [[ -n "$INTERNAL" ]]; then
  if [[ -n "$INTERNAL_RELEASE_NOTES" ]]; then
    INTERNAL_RELEASE_NOTES="${INTERNAL_RELEASE_NOTES}\n"
  fi
  INTERNAL_RELEASE_NOTES="${INTERNAL_RELEASE_NOTES}## Internal\n${INTERNAL}"
fi

# If no changes at all, provide default message
if [[ -z "$INTERNAL_RELEASE_NOTES" ]]; then
  INTERNAL_RELEASE_NOTES="No changelog provided"
fi

INTERNAL_RELEASE_NOTES=$(echo -e "$INTERNAL_RELEASE_NOTES" | sed 's/\\n$//')
echo -e "$INTERNAL_RELEASE_NOTES" > internal_release_notes.txt

log_success "Release notes generated:"
cat release_notes.txt
echo ""
log_success "Internal release notes generated:"
cat internal_release_notes.txt
echo ""

# Step 6 & 7: Setup certificates and build
# Step 6: Setup macOS certificates (only needed in CI with MACOS_CERTIFICATE)
# On local Mac, certificates are already in the system keychain
if [[ -n "$MACOS_CERTIFICATE" ]]; then
  log_info "Step 6: Setting up macOS certificates from environment..."

  KEYCHAIN_NAME="build.keychain"
  KEYCHAIN_PWD="${MACOS_KEYCHAIN_PWD:-$(openssl rand -base64 32)}"

  # Decode and import certificate
  echo "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12

  # Delete existing keychain if it exists
  security delete-keychain "$KEYCHAIN_NAME" 2>/dev/null || true

  # Create and configure keychain
  security create-keychain -p "$KEYCHAIN_PWD" "$KEYCHAIN_NAME"
  security default-keychain -s "$KEYCHAIN_NAME"
  security unlock-keychain -p "$KEYCHAIN_PWD" "$KEYCHAIN_NAME"
  security import certificate.p12 -k "$KEYCHAIN_NAME" -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PWD" "$KEYCHAIN_NAME"

  # Cleanup certificate file
  rm certificate.p12

  log_success "Certificates configured from environment"
  echo ""
else
  log_info "Step 6: Using certificates from system keychain (local Mac)"
  echo ""
fi

# Step 7: Build macOS app
log_info "Step 7: Building macOS app..."
BUILD_LOG=$(mktemp)

if [[ "$NOTARIZE" == "true" ]]; then
  log_info "Building with notarization..."
  # Capture output while still displaying it
  bun run build-mac 2>&1 | tee "$BUILD_LOG"
  BUILD_EXIT_CODE=${PIPESTATUS[0]}

  if [[ $BUILD_EXIT_CODE -ne 0 ]]; then
    log_error "Build failed with exit code $BUILD_EXIT_CODE"
    rm -f "$BUILD_LOG"
    exit 1
  fi

  # Check if notarization was skipped
  if grep -q "notarize skipped\|skipped macOS notarization\|notarize.*options were unable to be generated" "$BUILD_LOG"; then
    log_error "Notarization was skipped by electron-builder!"
    log_error "This usually means credentials are invalid or configuration is wrong."
    log_error "Check your APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID."
    log_error "If you intentionally want to skip notarization, use --no-notarize --skip-upload"
    rm -f "$BUILD_LOG"
    exit 1
  fi
else
  log_info "Building without notarization (local build)..."
  bun run build-mac:local 2>&1 | tee "$BUILD_LOG"
  BUILD_EXIT_CODE=${PIPESTATUS[0]}

  if [[ $BUILD_EXIT_CODE -ne 0 ]]; then
    log_error "Build failed with exit code $BUILD_EXIT_CODE"
    rm -f "$BUILD_LOG"
    exit 1
  fi
fi

rm -f "$BUILD_LOG"
log_success "Build completed"
echo ""

# Step 8: Create GitHub Release
if [[ "$SKIP_UPLOAD" == "false" ]]; then
  log_info "Step 8: Creating GitHub release..."
  
  REPO=$(git remote get-url origin | sed -E 's/.*github.com[:/](.+)(\.git)?$/\1/' | sed 's/\.git$//')
  
  if [[ ! -f "$DMG_PATH" ]] || [[ ! -f "$ZIP_PATH" ]]; then
    log_error "Build artifacts not found:"
    [[ ! -f "$DMG_PATH" ]] && echo "  Missing: $DMG_PATH"
    [[ ! -f "$ZIP_PATH" ]] && echo "  Missing: $ZIP_PATH"
    exit 1
  fi
  
  # Get file sizes for progress display
  DMG_SIZE_BYTES=$(stat -f%z "$DMG_PATH")
  ZIP_SIZE_BYTES=$(stat -f%z "$ZIP_PATH")
  DMG_SIZE_MB=$(echo "scale=1; $DMG_SIZE_BYTES / 1048576" | bc)
  ZIP_SIZE_MB=$(echo "scale=1; $ZIP_SIZE_BYTES / 1048576" | bc)
  
  # Check if release already exists and delete it (keep the tag)
  if gh release view "v$VERSION" &>/dev/null; then
    log_warning "Release v$VERSION already exists, deleting it to recreate..."
    gh release delete "v$VERSION" --yes
    log_success "Existing release deleted (tag preserved)"
  fi
  
  # Create release (without assets)
  log_info "Creating release v$VERSION..."
  gh release create "v$VERSION" \
    --title "Capty v$VERSION" \
    --notes-file release_notes.txt
  
  log_success "Release created"
  
  # Upload assets separately with progress
  log_info "Uploading DMG (${DMG_SIZE_MB} MB)..."
  gh release upload "v$VERSION" "$DMG_PATH" --clobber 2>&1 | while read -r line; do
    echo "  $line"
  done
  log_success "DMG uploaded"
  
  log_info "Uploading ZIP (${ZIP_SIZE_MB} MB)..."
  gh release upload "v$VERSION" "$ZIP_PATH" --clobber 2>&1 | while read -r line; do
    echo "  $line"
  done
  log_success "ZIP uploaded"
  
  log_success "GitHub release created with all assets"
  echo ""
  
  # Step 9: Upload to capty.app
  if [[ -n "$CAPTY_RELEASE_SECRET" ]]; then
    log_info "Step 9: Uploading to capty.app..."
    
    RELEASE_NOTES_CONTENT=$(cat release_notes.txt)
    INTERNAL_RELEASE_NOTES_CONTENT=$(cat internal_release_notes.txt)

    # Calculate SHA512 hashes with progress
    log_info "Calculating SHA512 hash for DMG..."
    DMG_SHA512=$(shasum -a 512 "$DMG_PATH" | awk '{print $1}' | xxd -r -p | base64)
    DMG_SIZE=$(stat -f%z "$DMG_PATH")
    log_success "DMG hash calculated"
    
    log_info "Calculating SHA512 hash for ZIP..."
    ZIP_SHA512=$(shasum -a 512 "$ZIP_PATH" | awk '{print $1}' | xxd -r -p | base64)
    ZIP_SIZE=$(stat -f%z "$ZIP_PATH")
    log_success "ZIP hash calculated"
    
    # Wait for assets to be fully available on GitHub
    log_info "Waiting for GitHub assets to be available..."
    MAX_RETRIES=30
    RETRY_DELAY=5
    
    for ((i=1; i<=MAX_RETRIES; i++)); do
      RELEASE_DATA=$(gh api "repos/$REPO/releases/tags/v${VERSION}" 2>/dev/null || echo "{}")
      
      DMG_ASSET_ID=$(echo "$RELEASE_DATA" | jq -r ".assets[] | select(.name == \"${DMG_NAME}\") | .id")
      ZIP_ASSET_ID=$(echo "$RELEASE_DATA" | jq -r ".assets[] | select(.name == \"${ZIP_NAME}\") | .id")
      DMG_STATE=$(echo "$RELEASE_DATA" | jq -r ".assets[] | select(.name == \"${DMG_NAME}\") | .state")
      ZIP_STATE=$(echo "$RELEASE_DATA" | jq -r ".assets[] | select(.name == \"${ZIP_NAME}\") | .state")
      
      # Check if both assets exist and are uploaded
      if [[ -n "$DMG_ASSET_ID" ]] && [[ "$DMG_ASSET_ID" != "null" ]] && \
         [[ -n "$ZIP_ASSET_ID" ]] && [[ "$ZIP_ASSET_ID" != "null" ]] && \
         [[ "$DMG_STATE" == "uploaded" ]] && [[ "$ZIP_STATE" == "uploaded" ]]; then
        log_success "All assets are available on GitHub"
        break
      fi
      
      if [[ $i -eq $MAX_RETRIES ]]; then
        log_error "Timeout waiting for assets to be available"
        echo "  DMG: ID=$DMG_ASSET_ID, State=$DMG_STATE"
        echo "  ZIP: ID=$ZIP_ASSET_ID, State=$ZIP_STATE"
        exit 1
      fi
      
      echo -ne "\r  Waiting for assets... (attempt $i/$MAX_RETRIES, DMG: $DMG_STATE, ZIP: $ZIP_STATE)"
      sleep $RETRY_DELAY
    done
    echo ""
    
    DMG_URL="https://api.github.com/repos/$REPO/releases/assets/${DMG_ASSET_ID}"
    ZIP_URL="https://api.github.com/repos/$REPO/releases/assets/${ZIP_ASSET_ID}"
    
    # Escape release notes for JSON
    RELEASE_NOTES_ESCAPED=$(echo "$RELEASE_NOTES_CONTENT" | jq -Rs .)
    INTERNAL_RELEASE_NOTES_ESCAPED=$(echo "$INTERNAL_RELEASE_NOTES_CONTENT" | jq -Rs .)

    # Build JSON payload
    JSON_PAYLOAD=$(cat <<EOF
{
  "secret": "${CAPTY_RELEASE_SECRET}",
  "version": "${VERSION}",
  "release_notes": ${RELEASE_NOTES_ESCAPED},
  "internal_release_notes": ${INTERNAL_RELEASE_NOTES_ESCAPED},
  "files": [
    {
      "url": "${DMG_URL}",
      "name": "${DMG_NAME}",
      "platform": "macos",
      "arch": "universal",
      "sha512": "${DMG_SHA512}",
      "size": ${DMG_SIZE}
    },
    {
      "url": "${ZIP_URL}",
      "name": "${ZIP_NAME}",
      "platform": "macos",
      "arch": "universal",
      "sha512": "${ZIP_SHA512}",
      "size": ${ZIP_SIZE}
    }
  ]
}
EOF
)
    
    log_info "Sending request to capty.app..."
    echo "$JSON_PAYLOAD" | jq 'del(.secret)'
    
    # Use curl with progress bar for the API call
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "https://capty.app/api/versions" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      --data-raw "$JSON_PAYLOAD")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    echo "Response status: $HTTP_CODE"
    echo "Response body: $BODY"
    
    if [[ "$HTTP_CODE" -ge 200 ]] && [[ "$HTTP_CODE" -lt 300 ]]; then
      log_success "Upload to capty.app successful!"
    else
      log_error "Upload to capty.app failed with status $HTTP_CODE"
      exit 1
    fi
  else
    log_warning "CAPTY_RELEASE_SECRET not set - skipping capty.app upload"
  fi
else
  log_warning "Skipping GitHub release and capty.app upload"
fi

# Cleanup (only if we created a build keychain)
if [[ -n "$MACOS_CERTIFICATE" ]]; then
  log_info "Cleaning up keychain..."
  security default-keychain -s login.keychain 2>/dev/null || true
  security delete-keychain build.keychain 2>/dev/null || true
fi

rm -f release_notes.txt internal_release_notes.txt

echo ""
log_success "Release $VERSION completed successfully!"
echo ""
echo "Artifacts:"
echo "  - release/${VERSION}/Capty-${VERSION}-universal.dmg"
echo "  - release/${VERSION}/Capty-${VERSION}-universal-mac.zip"
