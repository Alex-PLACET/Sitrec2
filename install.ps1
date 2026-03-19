# Sitrec one-liner installer for Windows PowerShell
# Usage: irm https://raw.githubusercontent.com/MickWest/Sitrec2/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$Dir = "sitrec"

if (Test-Path $Dir) {
    Write-Host "[sitrec] Directory '$Dir' already exists. To reinstall, remove it first." -ForegroundColor Red
    exit 1
}

Write-Host "[sitrec] Creating $Dir/"
New-Item -ItemType Directory -Path $Dir | Out-Null
Set-Location $Dir

@"
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
"@ | Set-Content -Path "docker-compose.yml" -Encoding UTF8

@"
# Sitrec configuration - uncomment and edit as needed.
# After changes: docker compose down && docker compose up

# === Banners (optional) ===
#BANNER_ACTIVE=true
#BANNER_TOP_TEXT=Welcome to Sitrec
#BANNER_BOTTOM_TEXT=
#BANNER_COLOR=#FFFFFF
#BANNER_BACKGROUND_COLOR=#377e22
#BANNER_HEIGHT=20

# === Maps (optional - enables higher quality imagery) ===
#MAPBOX_TOKEN=pk.your_token_here
#MAPTILER_KEY=your_key_here

# === 3D Buildings (optional) ===
#CESIUM_ION_TOKEN=your_token_here
#GOOGLE_MAPS_API_KEY=your_key_here

# === AI Chat (optional) ===
#CHATBOT_ENABLED=true
#OPENAI_API=sk-your_key_here

# === Cloud Storage (optional - enables server-side saves) ===
#SAVE_TO_S3=true
#S3_ACCESS_KEY_ID=your_key_here
#S3_SECRET_ACCESS_KEY=your_secret_here
#S3_BUCKET=your-bucket
#S3_REGION=us-west-2
"@ | Set-Content -Path ".env" -Encoding UTF8

Write-Host "[sitrec] Pulling image..."
docker compose pull

Write-Host ""
Write-Host "============================================"
Write-Host "  Sitrec installed in .\$Dir\"
Write-Host "  "
Write-Host "  Start:   cd $Dir; docker compose up"
Write-Host "  Open:    http://localhost:8080"
Write-Host "  Config:  edit $Dir\.env"
Write-Host "============================================"
Write-Host ""
Write-Host "[sitrec] Starting..."
docker compose up
