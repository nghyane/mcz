#!/bin/sh
set -e

REPO="nghyane/mcz"
INSTALL_DIR="${MCZ_INSTALL_DIR:-/usr/local/bin}"

get_arch() {
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64) echo "x86_64" ;;
    aarch64|arm64) echo "aarch64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac
}

get_os() {
  os=$(uname -s)
  case "$os" in
    Linux)  echo "linux" ;;
    Darwin) echo "macos" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac
}

OS=$(get_os)
ARCH=$(get_arch)
NAME="mcz-${OS}-${ARCH}"

VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
URL="https://github.com/${REPO}/releases/download/${VERSION}/${NAME}.tar.gz"

echo "Installing mcz ${VERSION} (${OS}/${ARCH})..."

TMP=$(mktemp -d)
curl -fsSL "$URL" -o "${TMP}/mcz.tar.gz"
tar xzf "${TMP}/mcz.tar.gz" -C "$TMP"

if [ -w "$INSTALL_DIR" ]; then
  mv "${TMP}/mcz" "${INSTALL_DIR}/mcz"
else
  sudo mv "${TMP}/mcz" "${INSTALL_DIR}/mcz"
fi

rm -rf "$TMP"

echo "Installed mcz to ${INSTALL_DIR}/mcz"
mcz --help
