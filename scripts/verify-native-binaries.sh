#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARY_VERIFIER="$SCRIPT_DIR/verify-native-binary.cjs"

if [[ $# -eq 0 ]]; then
  set -- \
    capty-daemon "$PROJECT_ROOT/src/main/daemon/capty-daemon" \
    FFmpeg "$PROJECT_ROOT/src/main/binaries/ffmpeg/ffmpeg" \
    Whisper "$PROJECT_ROOT/src/main/binaries/whisper/whisper"
fi

if (( $# % 2 != 0 )); then
  echo "Native binary verification requires label and path pairs" >&2
  exit 1
fi

failed=0

while [[ $# -gt 0 ]]; do
  label="$1"
  binary_path="$2"
  shift 2

  if [[ ! -f "$binary_path" ]]; then
    echo "Missing $label: $binary_path" >&2
    failed=1
    continue
  fi

  if [[ ! -x "$binary_path" ]]; then
    echo "$label is not executable: $binary_path" >&2
    failed=1
    continue
  fi

  if ! /usr/bin/lipo "$binary_path" -verify_arch arm64 x86_64; then
    echo "$label is not a universal arm64/x86_64 binary: $binary_path" >&2
    failed=1
    continue
  fi

  if ! bun "$BINARY_VERIFIER" "$label" "$binary_path"; then
    failed=1
    continue
  fi

  echo "Verified $label: $binary_path"
done

if [[ $failed -ne 0 ]]; then
  exit 1
fi
