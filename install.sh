#!/bin/bash
# Sitrec one-liner installer (works with Docker or Podman)
# Usage: curl -sL https://raw.githubusercontent.com/MickWest/Sitrec2/main/install.sh | bash
#   or:  curl -sL ... | bash -s -- --podman    (force Podman)
#   or:  curl -sL ... | bash -s -- --docker    (force Docker)
#   or:  ./install.sh --offline --podman        (air-gapped install, image pre-loaded)
#
# Creates a sitrec/ directory with docker-compose.yml and .env template,
# then pulls and starts the container.
#
# For air-gapped systems, use --offline. This skips image pull and file
# downloads. You must pre-load the image and have install.sh locally:
#   podman load -i sitrec-image.tar
#   ./install.sh --offline --podman

set -e

DIR="sitrec"
FORCE_RUNTIME=""
OFFLINE=false
NO_SELINUX=false

for arg in "$@"; do
    case "$arg" in
        --podman)     FORCE_RUNTIME="podman" ;;
        --docker)     FORCE_RUNTIME="docker" ;;
        --offline)    OFFLINE=true ;;
        --no-selinux) NO_SELINUX=true ;;
    esac
done

# ---------------------------------------------------------------------------
# Detect container runtime: prefer docker, fall back to podman.
# Use --docker or --podman to override when both are installed.
# ---------------------------------------------------------------------------
detect_runtime() {
    if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
        COMPOSE="docker compose"
        RUNTIME="docker"
    elif command -v podman-compose &>/dev/null; then
        COMPOSE="podman-compose"
        RUNTIME="podman"
    elif command -v podman &>/dev/null && podman compose --help &>/dev/null 2>&1; then
        COMPOSE="podman compose"
        RUNTIME="podman"
    else
        echo "[sitrec] ERROR: Neither docker nor podman found. Install one first."
        exit 1
    fi
}

if [ "$FORCE_RUNTIME" = "podman" ]; then
    if command -v podman-compose &>/dev/null; then
        COMPOSE="podman-compose"
    elif command -v podman &>/dev/null; then
        COMPOSE="podman compose"
    else
        echo "[sitrec] ERROR: --podman specified but podman not found."
        exit 1
    fi
    RUNTIME="podman"
elif [ "$FORCE_RUNTIME" = "docker" ]; then
    if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
        COMPOSE="docker compose"
    else
        echo "[sitrec] ERROR: --docker specified but docker compose not available."
        exit 1
    fi
    RUNTIME="docker"
else
    detect_runtime
fi

echo "[sitrec] Using $RUNTIME ($COMPOSE)"

# ---------------------------------------------------------------------------
# Create install directory
# ---------------------------------------------------------------------------
if [ -d "$DIR" ]; then
    echo "[sitrec] Directory '$DIR' already exists. To reinstall, remove it first."
    exit 1
fi

echo "[sitrec] Creating $DIR/"
mkdir "$DIR"

# If a .env file exists in the current directory (pre-configured),
# copy it into the install directory instead of generating a template.
HAVE_EXISTING_ENV=false
if [ -f ".env" ]; then
    cp ".env" "$DIR/.env"
    HAVE_EXISTING_ENV=true
    echo "[sitrec] Copied existing .env into $DIR/"
fi

cd "$DIR"

# Create volume mount directories (Podman requires these to exist; Docker auto-creates them)
mkdir -p sitrec-videos

# ---------------------------------------------------------------------------
# Volume mount suffix: on SELinux systems (RHEL, Fedora, CentOS)
# volumes need :Z label for the container to access them.
# ---------------------------------------------------------------------------
VOL_SUFFIX=""
if [ "$NO_SELINUX" = false ] \
    && command -v getenforce &>/dev/null \
    && [ "$(getenforce 2>/dev/null)" = "Enforcing" ] \
    && [ -d /sys/fs/selinux ]; then
    VOL_SUFFIX=":Z"
    echo "[sitrec] SELinux enforcing — using :Z volume labels"
    echo "[sitrec] (use --no-selinux to disable if this causes problems)"
fi

# ---------------------------------------------------------------------------
# Write docker-compose.yml
# Uses simple string-form env_file (compatible with both Docker and Podman).
# ---------------------------------------------------------------------------
cat > docker-compose.yml <<COMPOSE
services:
  sitrec:
    image: ghcr.io/mickwest/sitrec2:latest
    ports:
      - '8080:80'
    env_file:
      - .env
    volumes:
      - ./sitrec-videos:/var/www/html/sitrec-videos${VOL_SUFFIX}
COMPOSE

# ---------------------------------------------------------------------------
# Write .env template (only if no pre-existing .env was copied)
# ---------------------------------------------------------------------------
if [ "$HAVE_EXISTING_ENV" = false ]; then
cat > .env <<'ENV'
# Sitrec configuration — uncomment and edit as needed.
# After changes, run: ./sitrec.sh restart

# === Banners (optional) ===
#BANNER_ACTIVE=true
#BANNER_TOP_TEXT=Welcome to Sitrec
#BANNER_BOTTOM_TEXT=
#BANNER_COLOR="#FFFFFF"
#BANNER_BACKGROUND_COLOR="#377e22"
#BANNER_HEIGHT=20

# === Maps (optional — enables higher quality imagery) ===
#MAPBOX_TOKEN=pk.your_token_here
#MAPTILER_KEY=your_key_here

# === 3D Buildings (optional) ===
#CESIUM_ION_TOKEN=your_token_here
#GOOGLE_MAPS_API_KEY=your_key_here

# === AI Chat (optional) ===
#CHATBOT_ENABLED=true
#OPENAI_API=sk-your_key_here

# === Cloud Storage (optional — enables server-side saves) ===
#SAVE_TO_S3=true
#S3_ACCESS_KEY_ID=your_key_here
#S3_SECRET_ACCESS_KEY=your_secret_here
#S3_BUCKET=your-bucket
#S3_REGION=us-west-2
ENV
fi

# ---------------------------------------------------------------------------
# Save the detected runtime so sitrec.sh knows which compose command to use
# ---------------------------------------------------------------------------
echo "$COMPOSE" > .runtime

if [ "$OFFLINE" = true ]; then
    echo "[sitrec] Offline mode — skipping downloads and image pull"
    # Copy sitrec.sh from alongside install.sh (assumes local copy of repo files)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
    if [ -f "$SCRIPT_DIR/sitrec.sh" ]; then
        cp "$SCRIPT_DIR/sitrec.sh" sitrec.sh
    else
        echo "[sitrec] WARNING: sitrec.sh not found next to install.sh — run ./sitrec.sh help to check"
    fi
    if [ -f "$SCRIPT_DIR/shared.env.example" ]; then
        cp "$SCRIPT_DIR/shared.env.example" shared.env.example
    elif [ -f "$SCRIPT_DIR/config/shared.env.example" ]; then
        cp "$SCRIPT_DIR/config/shared.env.example" shared.env.example
    fi
else
    echo "[sitrec] Downloading shared.env.example..."
    curl -sL https://raw.githubusercontent.com/MickWest/Sitrec2/main/config/shared.env.example -o shared.env.example

    echo "[sitrec] Downloading sitrec.sh management script..."
    curl -sL https://raw.githubusercontent.com/MickWest/Sitrec2/main/sitrec.sh -o sitrec.sh

    echo "[sitrec] Pulling image..."
    $COMPOSE pull
fi
chmod +x sitrec.sh 2>/dev/null || true

echo ""
echo "============================================"
echo "  Sitrec installed in ./$DIR/"
echo "  "
echo "  Start:     ./sitrec.sh start"
echo "  Stop:      ./sitrec.sh stop"
echo "  Restart:   ./sitrec.sh restart  (after .env changes)"
echo "  Update:    ./sitrec.sh pull"
echo "  Open:      http://localhost:8080"
echo "  Config:    edit .env"
echo "============================================"
echo ""
# Clean up any stale containers from a previous install (e.g. if the user
# deleted the sitrec/ directory without running "down" first)
$COMPOSE down 2>/dev/null || true

echo "[sitrec] Starting..."
$COMPOSE up
