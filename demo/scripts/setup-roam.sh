#!/usr/bin/env bash
# demo/scripts/setup-roam.sh — Install roam-code into an isolated virtual environment.
#
# Called by .devcontainer/devcontainer.json postCreateCommand.
# Must be idempotent — safe to re-run on container rebuild.
set -euo pipefail

VENV_DIR="/home/node/.roam-venv"
ROAM_VERSION="11.2.0"

echo "🔧 Setting up roam-code v${ROAM_VERSION}..."

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

# Upgrade pip to avoid version notices and get faster installs
PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV_DIR/bin/pip" install --upgrade pip

# Install roam-code with MCP extras from GitHub (not published to PyPI)
# Uses PEP 508 syntax (required by pip >= 25.0)
"$VENV_DIR/bin/pip" install --quiet --upgrade "roam-code[mcp] @ git+https://github.com/cranot/roam-code.git@v${ROAM_VERSION}"

# Symlink roam binary to a directory on PATH
LINK_TARGET="/usr/local/bin/roam"
if [ ! -L "$LINK_TARGET" ] || [ "$(readlink -f "$LINK_TARGET")" != "$VENV_DIR/bin/roam" ]; then
  sudo ln -sf "$VENV_DIR/bin/roam" "$LINK_TARGET"
fi

# Verify installation
roam --version
echo "✅ roam-code ready"
