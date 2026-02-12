#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# ProPulse Setup Assistant
# Interactive installer for the ProPulse ham radio ecosystem (macOS / Linux)
# Safe to run multiple times (idempotent).
# ============================================================================

# ---------------------------------------------------------------------------
# Section 1 — Colors & Helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

info()    { echo -e "  ${CYAN}>${RESET} $1"; }
success() { echo -e "  ${GREEN}+${RESET} $1"; }
warn()    { echo -e "  ${YELLOW}!${RESET} $1"; }
error()   { echo -e "  ${RED}x${RESET} $1"; }
header()  { echo -e "\n  ${BOLD}$1${RESET}"; echo -e "  ${DIM}$(printf '%.0s-' {1..40})${RESET}"; }

prompt_yn() {
  local prompt="$1"
  local default="${2:-y}"
  local yn
  if [ "$default" = "y" ]; then
    printf "  ${CYAN}?${RESET} %s [Y/n] " "$prompt"
  else
    printf "  ${CYAN}?${RESET} %s [y/N] " "$prompt"
  fi
  read -r yn </dev/tty || yn=""
  yn="${yn:-$default}"
  case "$yn" in
    [Yy]*) return 0 ;;
    *)     return 1 ;;
  esac
}

# Global state populated by detection / check functions
PLATFORM=""
ARCH=""
PKG_MGR=""
NODE_OK=false
HAMLIB_OK=false
WSJTX_OK=false
BRIDGE_OK=false
BRIDGE_DIR=""

# ---------------------------------------------------------------------------
# Section 2 — Platform Detection
# ---------------------------------------------------------------------------

detect_platform() {
  local os
  os=$(uname -s)
  ARCH=$(uname -m)

  case "$os" in
    Darwin)
      PLATFORM="macos"
      PKG_MGR="brew"
      ;;
    Linux)
      PLATFORM="linux"
      if   command -v apt-get &>/dev/null; then PKG_MGR="apt"
      elif command -v dnf     &>/dev/null; then PKG_MGR="dnf"
      elif command -v pacman  &>/dev/null; then PKG_MGR="pacman"
      elif command -v apk     &>/dev/null; then PKG_MGR="apk"
      else PKG_MGR="unknown"
      fi
      ;;
    *)
      error "Unsupported OS: $os"
      exit 1
      ;;
  esac

  # Normalise architecture
  case "$ARCH" in
    x86_64|amd64)  ARCH="x64"   ;;
    arm64|aarch64) ARCH="arm64" ;;
  esac
}

# ---------------------------------------------------------------------------
# Section 3 — Dependency Discovery
# ---------------------------------------------------------------------------

check_node() {
  if command -v node &>/dev/null; then
    local version major
    version=$(node -v | sed 's/v//')
    major=$(echo "$version" | cut -d. -f1)
    if [ "$major" -ge 18 ]; then
      success "Node.js v${version} (>= 18 required)"
      NODE_OK=true
      return 0
    else
      warn "Node.js v${version} found but v18+ is required"
      NODE_OK=false
      return 1
    fi
  fi
  info "Node.js not found"
  NODE_OK=false
  return 1
}

check_npm() {
  if command -v npm &>/dev/null; then
    success "npm $(npm -v)"
    return 0
  fi
  info "npm not found"
  return 1
}

check_hamlib() {
  if command -v rigctld &>/dev/null; then
    local ver
    ver=$(rigctld --version 2>&1 | head -1)
    success "Hamlib: $ver"
    HAMLIB_OK=true
    return 0
  fi
  info "Hamlib (rigctld) not found"
  HAMLIB_OK=false
  return 1
}

check_wsjtx() {
  WSJTX_OK=false
  if [ "$PLATFORM" = "macos" ]; then
    if [ -d "/Applications/wsjtx.app" ] || command -v wsjtx &>/dev/null; then
      success "WSJT-X found"
      WSJTX_OK=true
      return 0
    fi
  else
    if command -v wsjtx &>/dev/null || [ -f "/usr/bin/wsjtx" ] || [ -f "/usr/local/bin/wsjtx" ]; then
      success "WSJT-X found"
      WSJTX_OK=true
      return 0
    fi
  fi
  info "WSJT-X not found (optional - install separately if needed)"
  return 1
}

check_bridge() {
  BRIDGE_OK=false
  BRIDGE_DIR=""

  # Resolve the project root relative to this script
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local project_root
  project_root="$(cd "$script_dir/.." && pwd)"

  if [ -d "$project_root/bridge" ]; then
    BRIDGE_DIR="$project_root/bridge"
  elif [ -d "./bridge" ]; then
    BRIDGE_DIR="$(cd ./bridge && pwd)"
  fi

  if [ -n "$BRIDGE_DIR" ] && [ -d "$BRIDGE_DIR/node_modules" ]; then
    success "Bridge dependencies installed ($BRIDGE_DIR)"
    BRIDGE_OK=true
    return 0
  elif [ -n "$BRIDGE_DIR" ]; then
    info "Bridge found at $BRIDGE_DIR but dependencies not installed"
    return 1
  else
    info "Bridge directory not found (run from Propulse root)"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Section 4 — Installation Functions
# ---------------------------------------------------------------------------

install_node() {
  header "Installing Node.js"

  case "$PLATFORM" in
    macos)
      if command -v brew &>/dev/null; then
        info "Installing via Homebrew..."
        brew install node@22
        brew link --overwrite node@22 2>/dev/null || true
      else
        info "Homebrew not found. Installing Node.js via nvm..."
        if ! command -v nvm &>/dev/null; then
          curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
          export NVM_DIR="${HOME}/.nvm"
          # shellcheck source=/dev/null
          [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        fi
        nvm install 22
        nvm use 22
      fi
      ;;
    linux)
      case "$PKG_MGR" in
        apt)
          info "Installing via NodeSource (Debian/Ubuntu)..."
          info "This will run commands with sudo. You may be prompted for your password."
          curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
          sudo apt-get install -y nodejs
          ;;
        dnf)
          info "Installing via dnf module (Fedora/RHEL)..."
          info "This will run commands with sudo. You may be prompted for your password."
          sudo dnf module install -y nodejs:22/common
          ;;
        pacman)
          info "Installing via pacman (Arch)..."
          info "This will run commands with sudo. You may be prompted for your password."
          sudo pacman -Sy --noconfirm nodejs npm
          ;;
        *)
          error "Could not determine package manager. Install Node.js 22 manually:"
          info "  https://nodejs.org/en/download/"
          return 1
          ;;
      esac
      ;;
  esac

  # Verify
  if check_node; then
    success "Node.js installed successfully"
  else
    error "Node.js installation may have failed. Please verify manually."
    return 1
  fi
}

install_hamlib() {
  header "Installing Hamlib"

  case "$PKG_MGR" in
    brew)
      info "Installing via Homebrew..."
      brew install hamlib
      ;;
    apt)
      info "This will run commands with sudo. You may be prompted for your password."
      sudo apt-get update -qq
      sudo apt-get install -y libhamlib-utils
      ;;
    dnf)
      info "This will run commands with sudo. You may be prompted for your password."
      sudo dnf install -y hamlib
      ;;
    pacman)
      info "This will run commands with sudo. You may be prompted for your password."
      sudo pacman -Sy --noconfirm hamlib
      ;;
    *)
      warn "Could not determine package manager."
      info "Install Hamlib manually: https://hamlib.github.io/"
      return 1
      ;;
  esac

  if check_hamlib; then
    success "Hamlib installed successfully"
  else
    warn "Hamlib installation may need manual verification"
  fi
}

install_bridge() {
  header "Installing Bridge Dependencies"

  if [ -z "$BRIDGE_DIR" ]; then
    # Try to locate bridge directory
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root
    project_root="$(cd "$script_dir/.." && pwd)"

    if [ -d "$project_root/bridge" ]; then
      BRIDGE_DIR="$project_root/bridge"
    elif [ -d "./bridge" ]; then
      BRIDGE_DIR="$(cd ./bridge && pwd)"
    else
      error "Bridge directory not found."
      info "Make sure you're running this from the Propulse project root,"
      info "or that the bridge/ directory exists."
      echo ""
      info "  git clone <repo-url>"
      info "  cd propulse"
      info "  bash scripts/setup.sh"
      return 1
    fi
  fi

  info "Installing in: $BRIDGE_DIR"
  (cd "$BRIDGE_DIR" && npm install)

  if [ -d "$BRIDGE_DIR/node_modules" ]; then
    success "Bridge dependencies installed"
    BRIDGE_OK=true
  else
    error "Installation may have failed"
    return 1
  fi

  # Copy app dist for offline serving if available
  local project_root
  project_root="$(cd "$BRIDGE_DIR/.." && pwd)"
  if [ -d "$project_root/dist" ]; then
    info "Copying app files to bridge for offline serving..."
    cp -r "$project_root/dist" "$BRIDGE_DIR/dist"
    success "App files ready for offline serving on localhost:3173"
  fi
}

# ---------------------------------------------------------------------------
# Section 5 — Configuration Functions
# ---------------------------------------------------------------------------

configure_wsjtx() {
  header "WSJT-X Configuration"
  echo ""
  info "To connect WSJT-X to Propulse, enable UDP reporting:"
  echo ""
  info "  1. Open WSJT-X"
  info "  2. Go to File > Settings > Reporting tab"
  info "  3. Check 'Accept UDP requests'"
  info "  4. Set UDP port to: ${BOLD}2237${RESET} (default)"
  info "  5. Click OK"
  echo ""
  info "The bridge will automatically listen for WSJT-X data on this port."
  echo ""

  if prompt_yn "Have you configured WSJT-X?" "n"; then
    success "WSJT-X configuration noted"
  else
    info "You can configure this later. The bridge works without WSJT-X."
  fi
}

configure_service() {
  header "Auto-Start Service"

  if [ "$PLATFORM" = "linux" ] && command -v systemctl &>/dev/null; then
    info "Creating systemd service for ProPulse Bridge..."
    info "This will run commands with sudo. You may be prompted for your password."

    local bridge_path
    bridge_path="$(cd "$BRIDGE_DIR" && pwd)"

    local service_file="/etc/systemd/system/propulse-bridge.service"

    sudo tee "$service_file" > /dev/null << SVCEOF
[Unit]
Description=ProPulse Bridge Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$bridge_path
ExecStart=$(command -v node) $bridge_path/dist/server.js
Restart=on-failure
RestartSec=5
Environment=BRIDGE_PORT=9867
Environment=BRIDGE_HOST=127.0.0.1

[Install]
WantedBy=multi-user.target
SVCEOF

    info "Building bridge for production..."
    (cd "$bridge_path" && npm run build)

    sudo systemctl daemon-reload
    sudo systemctl enable propulse-bridge
    sudo systemctl start propulse-bridge

    if systemctl is-active --quiet propulse-bridge; then
      success "Bridge service running and enabled at boot"
    else
      warn "Service created but may not have started."
      info "Check status: sudo systemctl status propulse-bridge"
    fi

  elif [ "$PLATFORM" = "macos" ]; then
    info "Creating launchd agent for ProPulse Bridge..."

    local bridge_path
    bridge_path="$(cd "$BRIDGE_DIR" && pwd)"
    local plist_path="$HOME/Library/LaunchAgents/com.propulse.bridge.plist"
    local log_dir="$HOME/Library/Logs/ProPulse"
    mkdir -p "$log_dir"

    info "Building bridge for production..."
    (cd "$bridge_path" && npm run build)

    cat > "$plist_path" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.propulse.bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(command -v node)</string>
        <string>${bridge_path}/dist/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${bridge_path}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${log_dir}/bridge.log</string>
    <key>StandardErrorPath</key>
    <string>${log_dir}/bridge-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>BRIDGE_PORT</key>
        <string>9867</string>
        <key>BRIDGE_HOST</key>
        <string>127.0.0.1</string>
    </dict>
</dict>
</plist>
PLISTEOF

    launchctl load "$plist_path"

    success "Bridge agent loaded (starts at login)"
    info "Logs: $log_dir/bridge.log"
    info "Stop: launchctl unload $plist_path"

  else
    warn "Auto-start not supported on this platform"
    info "Start the bridge manually: cd bridge && npm start"
  fi
}

# ---------------------------------------------------------------------------
# Section 6 — Connectivity Test
# ---------------------------------------------------------------------------

test_connectivity() {
  header "Connectivity Test"

  # Test bridge WebSocket
  if command -v node &>/dev/null; then
    local result
    result=$(node -e "
      const net = require('net');
      const c = net.createConnection({port: 9867, host: '127.0.0.1', timeout: 3000});
      c.on('connect', () => { console.log('OK'); c.end(); });
      c.on('error',   () => { console.log('FAIL'); });
      c.on('timeout', () => { console.log('TIMEOUT'); c.end(); });
    " 2>/dev/null || echo "FAIL")

    if [ "$result" = "OK" ]; then
      success "Bridge server reachable at ws://127.0.0.1:9867"
    else
      warn "Bridge not responding on port 9867"
      info "Start it with:  npm run bridge  (from propulse root)"
    fi
  elif command -v nc &>/dev/null; then
    if nc -z -w 2 127.0.0.1 9867 2>/dev/null; then
      success "Port 9867 is open (bridge likely running)"
    else
      warn "Port 9867 not open - bridge not running"
    fi
  else
    info "Cannot test bridge (no node or nc available)"
  fi

  # Test rigctld
  if command -v rigctld &>/dev/null; then
    if command -v nc &>/dev/null && echo "f" | nc -w 1 127.0.0.1 4532 &>/dev/null; then
      success "rigctld reachable on port 4532"
    else
      info "rigctld not running (optional - start with: rigctld -m MODEL -r DEVICE)"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Section 7 — Main Interactive Flow
# ---------------------------------------------------------------------------

main() {
  clear
  echo ""
  echo -e "  ${BOLD}+==========================================+${RESET}"
  echo -e "  ${BOLD}|${RESET}  ${CYAN}ProPulse Setup Assistant${RESET}                ${BOLD}|${RESET}"
  echo -e "  ${BOLD}|${RESET}  ${DIM}The ionosphere, visualized${RESET}               ${BOLD}|${RESET}"
  echo -e "  ${BOLD}+==========================================+${RESET}"
  echo ""

  # Detect platform
  detect_platform
  info "Platform: ${BOLD}${PLATFORM}${RESET} (${ARCH})"
  info "Package manager: ${BOLD}${PKG_MGR}${RESET}"
  echo ""

  # Discovery phase
  header "Checking installed components"
  check_node   || true
  check_npm    || true
  check_hamlib || true
  check_wsjtx  || true
  check_bridge || true
  echo ""

  # Interactive installation menu
  header "What would you like to set up?"

  local tasks=()

  if [ "$NODE_OK" != "true" ]; then
    if prompt_yn "Install Node.js >= 18?"; then
      tasks+=(node)
    fi
  fi

  if prompt_yn "Install/update bridge dependencies?" "y"; then
    tasks+=(bridge)
  fi

  if [ "$HAMLIB_OK" != "true" ]; then
    if prompt_yn "Install Hamlib (for radio CAT control)?" "y"; then
      tasks+=(hamlib)
    fi
  fi

  if [ "$WSJTX_OK" = "true" ]; then
    if prompt_yn "Configure WSJT-X integration?" "y"; then
      tasks+=(wsjtx)
    fi
  fi

  if prompt_yn "Set up bridge as auto-start service?" "n"; then
    tasks+=(service)
  fi

  echo ""

  if [ ${#tasks[@]} -eq 0 ]; then
    info "Nothing to do! Everything looks good."
  else
    header "Installing selected components"

    for task in "${tasks[@]}"; do
      case "$task" in
        node)    install_node    ;;
        bridge)  install_bridge  ;;
        hamlib)  install_hamlib  ;;
        wsjtx)   configure_wsjtx ;;
        service) configure_service ;;
      esac
      echo ""
    done
  fi

  # Connectivity test
  if prompt_yn "Run connectivity test?" "y"; then
    test_connectivity
  fi

  # Summary
  echo ""
  header "Setup Complete"
  echo ""
  success "You're all set! Here's what to do next:"
  echo ""
  info "  1. Start the bridge:  ${BOLD}npm run bridge${RESET}  (from propulse root)"
  info "  2. Open Propulse:     ${BOLD}npm run dev${RESET}     (from propulse root)"
  info "  3. Check status:      Look for the green dot in the header"
  info "  4. Offline access:    ${BOLD}http://localhost:3173${RESET}  (after 'npm run build')"
  echo ""
  info "  Full health dashboard:  ${CYAN}http://localhost:5173/health${RESET}"
  info "  Bridge details:         ${CYAN}http://localhost:5173/bridge${RESET}"
  info "  Setup guide:            ${CYAN}http://localhost:5173/setup${RESET}"
  echo ""
}

main "$@"
