#!/bin/bash
# Sitrec one-liner installer (works with Docker or Podman)
# Usage: curl -sL https://raw.githubusercontent.com/MickWest/Sitrec2/main/install.sh | bash
#   or:  curl -sL ... | bash -s -- --podman    (force Podman)
#   or:  curl -sL ... | bash -s -- --docker    (force Docker)
#   or:  ./install.sh --tarball                 (install from local .tar image)
#   or:  ./install.sh --tarball sitrec-image.tar  (specify tarball path)
#   or:  ./install.sh --offline                 (image already loaded, skip pull)
#
# Creates a sitrec/ directory with docker-compose.yml and .env template,
# then pulls and starts the container.
#
# Air-gapped / tarball install:
#   On a connected machine, export the image:
#     docker save ghcr.io/mickwest/sitrec2:latest -o sitrec-image.tar
#       (or: podman save ghcr.io/mickwest/sitrec2:latest -o sitrec-image.tar)
#   Copy install.sh and sitrec-image.tar to the air-gapped machine, then:
#     ./install.sh --tarball
#   If the image is already loaded (e.g. via docker load), use --offline instead.
#
# Options:
#   --podman      Force Podman (default: auto-detect)
#   --docker      Force Docker
#   --tarball [path]  Load image from a .tar file (auto-detected if path omitted)
#   --offline     Air-gapped install (skip pull, image must already be loaded)
#   --videos      Mount sitrec-videos/ volume for legacy sitches
#   --no-selinux  Skip :Z volume labels even on SELinux systems

set -e

DIR="sitrec"
FORCE_RUNTIME=""
OFFLINE=false
USE_TARBALL=false
TARBALL_PATH=""
NO_SELINUX=false
MOUNT_VIDEOS=false

while [ $# -gt 0 ]; do
    case "$1" in
        --podman)     FORCE_RUNTIME="podman" ;;
        --docker)     FORCE_RUNTIME="docker" ;;
        --offline)    OFFLINE=true ;;
        --tarball)
            USE_TARBALL=true
            # If the next arg exists and doesn't start with --, treat it as the path
            if [ -n "${2:-}" ] && [ "${2#--}" = "$2" ]; then
                TARBALL_PATH="$2"
                shift
            fi
            ;;
        --no-selinux) NO_SELINUX=true ;;
        --videos)     MOUNT_VIDEOS=true ;;
    esac
    shift
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

# ---------------------------------------------------------------------------
# Write docker-compose.yml
# Uses simple string-form env_file (compatible with both Docker and Podman).
# Volumes are only added with --videos flag (needed for legacy sitches only).
# ---------------------------------------------------------------------------
VOLUMES_BLOCK=""
if [ "$MOUNT_VIDEOS" = true ]; then
    mkdir -p sitrec-videos

    VOL_SUFFIX=""
    if [ "$NO_SELINUX" = false ] \
        && command -v getenforce &>/dev/null \
        && [ "$(getenforce 2>/dev/null)" = "Enforcing" ] \
        && [ -d /sys/fs/selinux ]; then
        VOL_SUFFIX=":Z"
        echo "[sitrec] SELinux enforcing — using :Z volume labels"
        echo "[sitrec] (use --no-selinux to disable if this causes problems)"
    fi

    VOLUMES_BLOCK="    volumes:
      - ./sitrec-videos:/var/www/html/sitrec-videos${VOL_SUFFIX}"
fi

cat > docker-compose.yml <<COMPOSE
services:
  sitrec:
    image: ghcr.io/mickwest/sitrec2:latest
    ports:
      - '8080:80'
    env_file:
      - .env
${VOLUMES_BLOCK}
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

# ---------------------------------------------------------------------------
# Detect local tarball — prompt interactively or honour --tarball flag
# ---------------------------------------------------------------------------
TARBALL=""
if [ -n "$TARBALL_PATH" ]; then
    # Explicit path given — resolve relative to original dir (parent of $DIR)
    if [ "${TARBALL_PATH#/}" = "$TARBALL_PATH" ]; then
        TARBALL="../$TARBALL_PATH"
    else
        TARBALL="$TARBALL_PATH"
    fi
elif [ "$USE_TARBALL" = true ] || [ "$OFFLINE" = false ]; then
    # Auto-detect: look for .tar files in the parent dir (we've already cd'd into $DIR)
    for f in ../*.tar; do
        [ -f "$f" ] || continue
        TARBALL="$f"
        break
    done
fi

if [ "$USE_TARBALL" = true ]; then
    if [ -z "$TARBALL" ] || [ ! -f "$TARBALL" ]; then
        echo "[sitrec] ERROR: --tarball specified but no .tar file found."
        [ -n "$TARBALL_PATH" ] && echo "[sitrec]   path: $TARBALL_PATH"
        exit 1
    fi
    echo "[sitrec] Loading image from $TARBALL..."
    $RUNTIME load -i "$TARBALL"
    OFFLINE=true
elif [ "$OFFLINE" = false ] && [ -n "$TARBALL" ] && [ -t 0 ]; then
    # Interactive terminal and tarball found — ask the user
    echo "[sitrec] Found local image tarball: $TARBALL"
    printf "[sitrec] Load image from this file instead of pulling? [y/N] "
    read -r answer
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
        echo "[sitrec] Loading image from $TARBALL..."
        $RUNTIME load -i "$TARBALL"
        OFFLINE=true
    fi
fi

if [ "$OFFLINE" = true ]; then
    echo "[sitrec] Offline mode — skipping image pull"
else
    echo "[sitrec] Pulling image..."
    $COMPOSE pull
fi

# Extract support files from the image
echo "[sitrec] Extracting support files from image..."
_cid=$($RUNTIME create ghcr.io/mickwest/sitrec2:latest --entrypoint /bin/true 2>/dev/null) || \
_cid=$($RUNTIME create ghcr.io/mickwest/sitrec2:latest 2>/dev/null)
$RUNTIME cp "$_cid":/usr/local/share/sitrec/sitrec.sh sitrec.sh
$RUNTIME cp "$_cid":/usr/local/share/sitrec/shared.env.example shared.env.example
$RUNTIME rm "$_cid" >/dev/null 2>&1 || true
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
