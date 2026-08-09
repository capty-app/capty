#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VERIFY_SCRIPT="$SCRIPT_DIR/verify-native-binaries.sh"
FFMPEG_PATH="$PROJECT_ROOT/src/main/binaries/ffmpeg/ffmpeg"
WHISPER_PATH="$PROJECT_ROOT/src/main/binaries/whisper/whisper"

"$SCRIPT_DIR/build-daemon.sh"

if ! "$VERIFY_SCRIPT" FFmpeg "$FFMPEG_PATH" >/dev/null 2>&1; then
  "$SCRIPT_DIR/build-ffmpeg.sh"
fi

if ! "$VERIFY_SCRIPT" Whisper "$WHISPER_PATH" >/dev/null 2>&1; then
  /bin/bash "$SCRIPT_DIR/build-whisper.sh"
fi

"$VERIFY_SCRIPT"
