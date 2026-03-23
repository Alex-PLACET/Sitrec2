#!/bin/bash
# Sitrec management script
# Usage: ./sitrec.sh [command]
#
# Commands:
#   start       Start the container
#   stop        Stop the container
#   restart     Stop and recreate the container (picks up .env changes)
#   pull        Pull the latest image and recreate the container
#   versions    List available versions and switch to one
#   update      Update this script and shared.env.example from GitHub
#   logs        Follow container logs
#   status      Show container status
#
# The compose command (docker compose / podman-compose) is read from
# .runtime, which is written by install.sh during initial setup.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE="ghcr.io/mickwest/sitrec2"

# ---------------------------------------------------------------------------
# Read the compose command from .runtime (written by install.sh)
# ---------------------------------------------------------------------------
if [ -f ".runtime" ]; then
    COMPOSE="$(cat .runtime)"
else
    # Fall back to auto-detection if .runtime is missing
    if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
        COMPOSE="docker compose"
    elif command -v podman-compose &>/dev/null; then
        COMPOSE="podman-compose"
    elif command -v podman &>/dev/null && podman compose --help &>/dev/null 2>&1; then
        COMPOSE="podman compose"
    else
        echo "[sitrec] ERROR: Neither docker nor podman found."
        exit 1
    fi
    echo "[sitrec] Note: .runtime not found, auto-detected: $COMPOSE"
fi

# ---------------------------------------------------------------------------
# Helper: switch the image tag in docker-compose.yml
# ---------------------------------------------------------------------------
switch_version() {
    local tag="$1"
    sed -i.bak "s|image: ${IMAGE}:.*|image: ${IMAGE}:${tag}|" docker-compose.yml
    rm -f docker-compose.yml.bak
    echo "[sitrec] Switched to ${IMAGE}:${tag}"
    $COMPOSE pull
    $COMPOSE down
    $COMPOSE up -d
    echo "[sitrec] Running version ${tag} at http://localhost:8080"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
case "${1:-help}" in
    start|restart)
        echo "[sitrec] Starting (recreating container to pick up any .env changes)..."
        $COMPOSE down 2>/dev/null || true
        $COMPOSE up -d
        echo "[sitrec] Running at http://localhost:8080"
        ;;
    stop)
        echo "[sitrec] Stopping..."
        $COMPOSE down
        ;;
    pull)
        echo "[sitrec] Pulling latest image and restarting..."
        $COMPOSE pull
        $COMPOSE down
        $COMPOSE up -d
        echo "[sitrec] Updated and running at http://localhost:8080"
        ;;
    versions)
        echo "[sitrec] Fetching available versions from GHCR..."

        # Get anonymous auth token
        TOKEN=$(curl -sf "https://ghcr.io/token?scope=repository:mickwest/sitrec2:pull" \
            | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)

        if [ -z "$TOKEN" ]; then
            echo "[sitrec] ERROR: Could not reach GHCR. Are you online?"
            exit 1
        fi

        # Fetch tags, filter to version numbers + latest, sort newest first
        TAGS=$(curl -sf -H "Authorization: Bearer $TOKEN" \
            "https://ghcr.io/v2/mickwest/sitrec2/tags/list" \
            | python3 -c "
import sys, json
data = json.load(sys.stdin)
tags = [t for t in data['tags'] if not t.startswith('build-')]
def sort_key(t):
    if t == 'latest':
        return (float('inf'),)
    try:
        return tuple(int(p) for p in t.split('.'))
    except ValueError:
        return (-1,)
tags.sort(key=sort_key, reverse=True)
for t in tags:
    print(t)
" 2>/dev/null)

        if [ -z "$TAGS" ]; then
            echo "[sitrec] ERROR: Could not fetch version list."
            exit 1
        fi

        # Show current version
        CURRENT=$(grep "image:" docker-compose.yml | sed "s|.*${IMAGE}:||" | tr -d ' ')
        echo ""
        echo "  Current: $CURRENT"
        echo ""

        # Number the list
        i=1
        while IFS= read -r tag; do
            if [ "$tag" = "$CURRENT" ]; then
                printf "  %2d) %s  <-- current\n" "$i" "$tag"
            else
                printf "  %2d) %s\n" "$i" "$tag"
            fi
            i=$((i + 1))
        done <<< "$TAGS"

        echo ""
        printf "Enter number to switch (or press Enter to cancel): "
        read -r choice

        if [ -z "$choice" ]; then
            echo "[sitrec] Cancelled."
            exit 0
        fi

        # Get the selected tag
        SELECTED=$(echo "$TAGS" | sed -n "${choice}p")

        if [ -z "$SELECTED" ]; then
            echo "[sitrec] Invalid selection."
            exit 1
        fi

        if [ "$SELECTED" = "$CURRENT" ]; then
            echo "[sitrec] Already running $CURRENT."
            exit 0
        fi

        switch_version "$SELECTED"
        ;;
    update)
        echo "[sitrec] Updating sitrec.sh from GitHub..."
        REPO_URL="https://raw.githubusercontent.com/MickWest/Sitrec2/main"
        # Download to temp file first — replacing a running script mid-execution is unsafe
        curl -sf "$REPO_URL/sitrec.sh" -o sitrec.sh.tmp
        if [ $? -ne 0 ] || [ ! -s sitrec.sh.tmp ]; then
            rm -f sitrec.sh.tmp
            echo "[sitrec] ERROR: Download failed. Are you online?"
            exit 1
        fi
        mv sitrec.sh.tmp sitrec.sh
        chmod +x sitrec.sh
        echo "[sitrec] Updated sitrec.sh"

        echo "[sitrec] Updating shared.env.example..."
        curl -sf "$REPO_URL/config/shared.env.example" -o shared.env.example.tmp
        if [ -s shared.env.example.tmp ]; then
            mv shared.env.example.tmp shared.env.example
            echo "[sitrec] Updated shared.env.example"
        else
            rm -f shared.env.example.tmp
            echo "[sitrec] WARNING: Could not update shared.env.example"
        fi

        echo "[sitrec] Done. Run ./sitrec.sh pull to also update the Sitrec image."
        ;;
    logs)
        $COMPOSE logs -f
        ;;
    status)
        $COMPOSE ps
        ;;
    help|--help|-h)
        echo "Usage: ./sitrec.sh [command]"
        echo ""
        echo "Commands:"
        echo "  start     Start (or restart) the container"
        echo "  stop      Stop the container"
        echo "  pull      Pull latest image and recreate"
        echo "  versions  List available versions and switch"
        echo "  update    Update this script from GitHub"
        echo "  logs      Follow container logs"
        echo "  status    Show container status"
        ;;
    *)
        echo "[sitrec] Unknown command: $1"
        echo "Run ./sitrec.sh help for usage."
        exit 1
        ;;
esac
