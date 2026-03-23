#!/bin/bash
# Sitrec management script
# Usage: ./sitrec.sh [command]
#
# Commands:
#   start       Start the container
#   stop        Stop the container
#   restart     Stop and recreate the container (picks up .env changes)
#   pull        Pull the latest image and recreate the container
#   logs        Follow container logs
#   status      Show container status
#
# The compose command (docker compose / podman-compose) is read from
# .runtime, which is written by install.sh during initial setup.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

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
# Commands
# ---------------------------------------------------------------------------
case "${1:-help}" in
    start)
        echo "[sitrec] Starting..."
        $COMPOSE up -d
        echo "[sitrec] Running at http://localhost:8080"
        ;;
    stop)
        echo "[sitrec] Stopping..."
        $COMPOSE down
        ;;
    restart)
        echo "[sitrec] Restarting (recreating container to pick up .env changes)..."
        $COMPOSE down
        $COMPOSE up -d
        echo "[sitrec] Running at http://localhost:8080"
        ;;
    pull)
        echo "[sitrec] Pulling latest image and restarting..."
        $COMPOSE pull
        $COMPOSE down
        $COMPOSE up -d
        echo "[sitrec] Updated and running at http://localhost:8080"
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
        echo "  start     Start the container"
        echo "  stop      Stop the container"
        echo "  restart   Stop and recreate (picks up .env changes)"
        echo "  pull      Pull latest image and recreate"
        echo "  logs      Follow container logs"
        echo "  status    Show container status"
        ;;
    *)
        echo "[sitrec] Unknown command: $1"
        echo "Run ./sitrec.sh help for usage."
        exit 1
        ;;
esac
