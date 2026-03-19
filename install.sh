#!/bin/bash
# Sitrec one-liner installer
# Usage: curl -sL https://raw.githubusercontent.com/MickWest/Sitrec2/main/install.sh | bash
#
# Creates a sitrec/ directory with docker-compose.yml and .env template,
# then pulls and starts the container.

set -e

DIR="sitrec"

if [ -d "$DIR" ]; then
    echo "[sitrec] Directory '$DIR' already exists. To reinstall, remove it first."
    exit 1
fi

echo "[sitrec] Creating $DIR/"
mkdir "$DIR"
cd "$DIR"

cat > docker-compose.yml <<'COMPOSE'
services:
  sitrec:
    image: ghcr.io/mickwest/sitrec2:latest
    ports:
      - '8080:80'
    env_file:
      - path: .env
        required: false
    volumes:
      - ./sitrec-videos:/var/www/html/sitrec-videos
COMPOSE

cat > .env <<'ENV'
# Sitrec configuration — uncomment and edit as needed.
# After changes: docker compose down && docker compose up

# === Banners (optional) ===
#BANNER_ACTIVE=true
#BANNER_TOP_TEXT=Welcome to Sitrec
#BANNER_BOTTOM_TEXT=
#BANNER_COLOR=#FFFFFF
#BANNER_BACKGROUND_COLOR=#377e22
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

echo "[sitrec] Pulling image..."
docker compose pull

echo ""
echo "============================================"
echo "  Sitrec installed in ./$DIR/"
echo "  "
echo "  Start:   cd $DIR && docker compose up"
echo "  Open:    http://localhost:8080"
echo "  Config:  edit $DIR/.env"
echo "============================================"
echo ""
echo "[sitrec] Starting..."
docker compose up
