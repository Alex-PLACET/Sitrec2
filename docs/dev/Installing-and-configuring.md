# Installing Sitrec

**Just want to run Sitrec?** Follow the [Zero-Config Docker Image](#zero-config-docker-image-recommended) instructions below — it takes about 30 seconds and requires no programming knowledge.

For developers, there are additional options:

| Method | Best For | Requirements | Setup Time |
|--------|----------|--------------|------------|
| **Docker Image** | Running Sitrec, no setup needed | Docker Desktop only | ~30 seconds |
| Docker Build | Testing from source | Docker Desktop + Git | ~2 minutes |
| Serverless | Offline/portable use | Node.js (or just a browser) | ~30 seconds |
| Standalone | Development without web server | Node.js + PHP | ~30 seconds |
| Local Server | Full development environment | Node.js + Nginx/Apache + PHP | ~5 minutes |

---

## Zero-Config Docker Image (Recommended)

The fastest way to run Sitrec. No source code, no build tools, no configuration required. A pre-built image is published on each release and works on Windows, Mac (Intel and Apple Silicon), and Linux.

**Prerequisites:** Install and run [Docker Desktop](https://www.docker.com/).

### One-liner Install

Open a terminal and paste the command for your platform. This downloads a small install script that sets everything up automatically.

**Mac / Linux / WSL:**
```bash
curl -sL https://raw.githubusercontent.com/MickWest/Sitrec2/main/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/MickWest/Sitrec2/main/install.ps1 | iex
```

This creates a `sitrec/` folder in your current directory, downloads Sitrec, and starts it. Once you see "resuming normal operations" in the output, open **http://localhost:8080** in your browser.

### Manual Install

If you prefer to set things up yourself instead of using the install script:

1. Create a new folder (e.g. `sitrec`), and inside it create a text file named `docker-compose.yml` with this content:

```yaml
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
```

2. Open a terminal in that folder and run:
```bash
docker compose up
```

3. Once you see "resuming normal operations", open **http://localhost:8080** in your browser.

### Configuration (Optional)

Sitrec works out of the box with no configuration. To customize it, create a text file named `.env` in the same folder as `docker-compose.yml`. To enable a setting, remove the `#` at the start of the line and fill in your value.

The example below shows some commonly used settings. For the full list of available configuration variables, see [config/shared.env.example](../../config/shared.env.example).

```env
# === Maps (optional — enables higher quality satellite imagery) ===
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
```

After editing `.env`, restart the container:
```bash
docker compose down && docker compose up
```

Map sources that require an API token (e.g. MapBox, MapTiler) only appear in the terrain menu when the corresponding token is provided. Without any tokens, the app uses ESRI World Imagery and AWS Terrarium elevation, which require no keys.

### Videos for Legacy Sitches (Optional)

Sitrec works fully without any video files — you can create and view custom sitches, load tracks, and explore 3D terrain. Video files are only needed to view legacy analysis sitches (Gimbal, GoFast, Aguadilla, etc.). These sitches can also be viewed online at [metabunk.org/sitrec](https://www.metabunk.org/sitrec).

If you want to run legacy sitches locally, download the public video files into a `sitrec-videos` folder next to your `docker-compose.yml`:

**Mac / Linux / WSL:**
```bash
curl -sL https://raw.githubusercontent.com/MickWest/Sitrec2/main/download-videos.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/MickWest/Sitrec2/main/download-videos.ps1 | iex
```

Or download manually from [this Dropbox folder](https://www.dropbox.com/scl/fo/biko4zk689lgh5m5ojgzw/h?rlkey=stuaqfig0f369jzujgizsicyn&dl=0) and place the files in `sitrec-videos/public/`. Then restart the container.

### Updating to the Latest Version

To get the newest release, run:
```bash
docker compose pull && docker compose up
```

### Pinning a Specific Version

By default Sitrec uses the latest release. To lock to a specific version, edit the `image:` line in `docker-compose.yml`:
```yaml
image: ghcr.io/mickwest/sitrec2:2.36.0
```

---

*The sections below are for developers. If you just want to run Sitrec, the Docker Image method above is all you need.*

---

## Docker Build from Source

Build the Docker image locally from the source code. Useful for testing changes before they're released, or for customizing `config.js` with additional map sources.

**Prerequisites:** Docker Desktop, Git

```bash
git clone https://github.com/MickWest/sitrec2 sitrec-test-dev
cd sitrec-test-dev
docker compose up --build
```

The app will be at **http://localhost:8080**. The Dockerfile automatically copies `.example` config files if the live versions don't exist, so no manual config setup is needed.

### Docker Development Build (Hot Reload)

For active development with automatic recompilation:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

| Feature | Standard Docker | Development Docker |
|---------|----------------|-------------------|
| Purpose | Production-like | Active development |
| File Changes | Requires rebuild | Auto-recompile |
| Ports | 8080 | 8080 (webpack), 8081 (Apache) |
| Hot Reload | No | Yes |

---

## Serverless Build (No Backend Required)

Creates a version of Sitrec that runs without PHP. All data is stored in the browser's IndexedDB.

**Prerequisites:** Node.js (for server mode) or just a modern browser (for static files)

### Node.js Server Mode

```bash
git clone https://github.com/MickWest/sitrec2 sitrec-test-dev
cd sitrec-test-dev
for f in config/*.example; do cp "$f" "${f%.example}"; done
npm install
npm run dev-serverless
```

Open **http://localhost:3000/sitrec**

### Static Files Mode

After building with `npm run build-serverless`, the files in `dist-serverless/` can be opened directly in a browser, hosted on any static server (GitHub Pages, S3, etc.), or run completely offline.

**Limitations:** No server-side saves, no cloud sync, no AI chat.
**Advantages:** Zero backend dependencies, works offline, data never leaves your machine.

---

## Standalone Node.js Server

Self-contained build using Node.js + your system's PHP. No separate web server needed.

**Prerequisites:** Node.js, PHP 8.3+ in PATH

```bash
git clone https://github.com/MickWest/sitrec2 sitrec-test-dev
cd sitrec-test-dev
for f in config/*.example; do cp "$f" "${f%.example}"; done
npm install
npm run dev-standalone-debug
```

**Windows:** Replace the `for` line with: `for %f in (config\*.example) do copy /Y "%f" "%~dpnf"`

Open **http://localhost:3000/sitrec**

This starts a Node.js Express server on port 3000 and PHP's built-in server on port 8000, with proxying between them.

---

## Local Web Server Installation

Full development environment with Nginx/Apache + PHP. This is the setup used for production deployments and active Sitrec development.

### Prerequisites

- Web server (Nginx or Apache) with PHP 8.3+ and HTTPS support
- Node.js with npm

### Setup

```bash
git clone https://github.com/MickWest/sitrec2 sitrec-test-dev
cd sitrec-test-dev
for f in config/*.example; do cp "$f" "${f%.example}"; done
npm install
```

**Windows:** Replace the `for` line with: `for %f in (config\*.example) do copy /Y "%f" "%~dpnf"`

### Configure Paths

Edit `config/config-install.js` to point at your web server:

```javascript
module.exports = {
    dev_path: '/path/to/your/webserver/sitrec',
    prod_path: '/path/to/staging/folder'
}
```

### Create Server Directory Structure

Your web server root needs these directories:

- `sitrec/` — the built application (created by webpack)
- `sitrec-cache/` — server-side tile cache (must be writable)
- `sitrec-upload/` — user file uploads (must be writable)
- `sitrec-videos/` — video files (see "Download the Videos" below)
- `sitrec-terrain/` — local terrain tile cache (optional)

### Build

```bash
npm run build    # development build
npm run deploy   # production build (minified)
```

### Configure

Edit the files in `config/`:

- **`shared.env`** — API keys, feature flags, storage settings. See `shared.env.example` for all options.
- **`config.js`** — Custom map sources, help links, local sitch selection. See `config.js.example`.
- **`config.php`** — Server-side auth integration (XenForo, etc.). See `config.php.example`.
- **`config-install.js`** — Build output paths.

### Download Videos

Public videos (government-produced, unrestricted) are available at:
https://www.dropbox.com/scl/fo/biko4zk689lgh5m5ojgzw/h?rlkey=stuaqfig0f369jzujgizsicyn&dl=0

Place them in `sitrec-videos/public/`.

### Testing

After building, verify with these URL tests (adjust the path if not at `/sitrec/`):

- PHP: `http://localhost/sitrec/sitrecServer/info.php` — should show PHP info page
- Terrain proxy: `http://localhost/sitrec/sitrecServer/cachemaps.php?url=https%3A%2F%2Fs3.amazonaws.com%2Felevation-tiles-prod%2Fterrarium%2F14%2F3188%2F6188.png` — should return a terrain tile image
- Default sitch: `http://localhost/sitrec/` — loads the default sitch
- Smoke test: `http://localhost/sitrec/?testAll=1` — loads all sitches sequentially

---

## Build Commands Reference

### Development

| Command | Description |
|---------|-------------|
| `npm run build` | Build to `dev_path` (requires web server) |
| `npm run start` | Webpack dev server with hot reload (port 3000) |
| `npm run copy` | Copy data/PHP files only (no JS rebuild) |

### Standalone

| Command | Description |
|---------|-------------|
| `npm run dev-standalone-debug` | Build + run with debugging |
| `npm run build-standalone` | Build only |
| `npm run start-standalone` | Run only |

### Serverless

| Command | Description |
|---------|-------------|
| `npm run dev-serverless` | Build + run |
| `npm run build-serverless` | Build only |
| `npm run start-serverless` | Run only |

### Production

| Command | Description |
|---------|-------------|
| `npm run deploy` | Minified production build to `prod_path` |

### Port Configuration

| Mode | Default | Environment Variable |
|------|---------|---------------------|
| Dev server | 3000 | `SITREC_PORT` |
| Dev backend proxy | 8081 | `SITREC_BACKEND_PORT` |
| Standalone PHP | 8000 | `SITREC_PHP_PORT` |
| Docker / Docker Image | 8080 | (docker-compose.yml) |
| Docker Dev | 8080/8081 | (docker-compose.dev.yml) |

---

## Production Deployment

```bash
npm run deploy
```

Builds a minified production version to `prod_path`. Transfer to your production server via rsync, scp, or your preferred method:

```bash
rsync -avz --delete -e ssh "$LOCAL_DIR/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"
```

Ensure the five server directories exist on the production server with appropriate write permissions for `sitrec-cache` and `sitrec-upload`.

---

## Code Overview

Sitrec runs mostly client-side using JavaScript and Three.js for 3D rendering. Server-side scripts are written in PHP. The code is compiled using webpack.

### Project Structure

- `config/` — configuration files (`.example` templates provided)
- `data/` — per-sitch data (ADS-B, CSV, TLE, models, images)
- `docker/` — Docker build support files
- `docs/` — documentation
- `sitrecServer/` — PHP backend (map proxy, chat, user management)
- `src/` — JavaScript source code (entry point: `index.js`)
- `tests/` — Jest unit tests

### Debugging

Debug builds include source maps, no minification, and Node.js inspector support:

```bash
npm run dev-standalone-debug   # Build + run with full debugging
```

- **Browser:** Open DevTools → Sources → `webpack://sitrec/src/`
- **Node.js:** Connect Chrome DevTools via `chrome://inspect`
- **VS Code:** Use a launch config targeting `standalone-server.js`

Debug endpoints (standalone/serverless): `/debug/status`, `/debug/files`, `/api/health`
