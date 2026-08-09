#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build-whisper"
OUTPUT_PATH="$PROJECT_ROOT/src/main/binaries/whisper/whisper"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

WHISPER_VERSION="v1.8.3"
WHISPER_COMMIT="2eeeba56e9edd762b4b38467bab96c2517163158"
WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"

cleanup() {
    if [ -d "$BUILD_DIR" ]; then
        echo -e "${YELLOW}Cleaning up build directory...${NC}"
        rm -rf "$BUILD_DIR"
    fi
}

trap cleanup EXIT

echo -e "${YELLOW}Building whisper.cpp for macOS (universal binary)...${NC}"
echo "  Version: $WHISPER_VERSION"

mkdir -p "$BUILD_DIR"
mkdir -p "$(dirname "$OUTPUT_PATH")"

echo -e "${YELLOW}Cloning whisper.cpp...${NC}"
git clone --depth 1 --branch "$WHISPER_VERSION" "$WHISPER_REPO" "$BUILD_DIR/whisper.cpp"

ACTUAL_COMMIT=$(git -C "$BUILD_DIR/whisper.cpp" rev-parse HEAD)
if [[ "$ACTUAL_COMMIT" != "$WHISPER_COMMIT" ]]; then
    echo -e "${RED}Error: whisper.cpp source revision does not match ${WHISPER_COMMIT}${NC}"
    exit 1
fi

cd "$BUILD_DIR/whisper.cpp"

echo -e "${YELLOW}Building for arm64 with Metal support...${NC}"
cmake -B build-arm64 \
    -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 \
    -DWHISPER_METAL=ON \
    -DWHISPER_COREML=OFF \
    -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=ON
cmake --build build-arm64 --config Release -j

echo -e "${YELLOW}Building for x86_64...${NC}"
cmake -B build-x86_64 \
    -DCMAKE_OSX_ARCHITECTURES=x86_64 \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 \
    -DCMAKE_C_FLAGS="-march=x86-64" \
    -DCMAKE_CXX_FLAGS="-march=x86-64" \
    -DGGML_NATIVE=OFF \
    -DWHISPER_METAL=OFF \
    -DWHISPER_COREML=OFF \
    -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=ON
cmake --build build-x86_64 --config Release -j

echo -e "${YELLOW}Creating universal binary...${NC}"
lipo -create \
    build-arm64/bin/whisper-cli \
    build-x86_64/bin/whisper-cli \
    -output "$OUTPUT_PATH"

chmod +x "$OUTPUT_PATH"

HELP_OUTPUT=$("$OUTPUT_PATH" --help 2>&1 || true)
if ! echo "$HELP_OUTPUT" | grep -qF -- "-dtw"; then
    echo -e "${RED}Error: whisper-cli does not support DTW timestamps${NC}"
    exit 1
fi
if ! echo "$HELP_OUTPUT" | grep -qF -- "-ojf"; then
    echo -e "${RED}Error: whisper-cli does not support JSON full output${NC}"
    exit 1
fi

ARCHS=$(lipo -archs "$OUTPUT_PATH")
if [[ "$ARCHS" == *"arm64"* ]] && [[ "$ARCHS" == *"x86_64"* ]]; then
    echo -e "${GREEN}Successfully built universal binary${NC}"
    echo "  Architectures: $ARCHS"
else
    echo -e "${RED}Error: Binary is not universal. Architectures: $ARCHS${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Build complete!${NC}"
echo "  Binary installed to: $OUTPUT_PATH"
