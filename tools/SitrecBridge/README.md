# SitrecBridge

An MCP (Model Context Protocol) server that bridges AI assistants to a running
Sitrec instance via a Chrome extension.

## Architecture

```
Claude Code / Claude Desktop
    │  (MCP protocol, stdio)
    ▼
mcp-server  (Node.js)
    │  (WebSocket, ws://localhost:9780)
    ▼
Chrome Extension  (background service worker)
    │  (chrome.tabs.sendMessage)
    ▼
content-script.js  (content script, isolated world)
    │  (window.postMessage)
    ▼
page-bridge.js  (page main world)
    │  (direct access)
    ▼
Sitrec globals  (NodeMan, Sit, par, Globals, etc.)
```

## Quick Start (Production)

**Prerequisites:** [Node.js](https://nodejs.org/) 18 or later.

### 1. Download and unzip

Download [`SitrecBridge.zip`](https://www.metabunk.org/sitrec/tools/SitrecBridge/dist/SitrecBridge.zip) and unzip it anywhere.

### 2. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `SitrecBridge/extension/` folder
5. The SitrecBridge extension should appear with a blue icon

### 3. Configure your MCP client

**Claude Code** — add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "sitrec-bridge": {
      "command": "node",
      "args": ["/path/to/SitrecBridge/mcp-server.mjs"]
    }
  }
}
```

**Claude Desktop** — edit `claude_desktop_config.json`
(Settings gear → Developer → Edit Config):

*macOS / Linux:*
```json
{
  "mcpServers": {
    "sitrec-bridge": {
      "command": "/path/to/SitrecBridge/run.sh"
    }
  }
}
```

*Windows:*
```json
{
  "mcpServers": {
    "sitrec-bridge": {
      "command": "/path/to/SitrecBridge/run.bat"
    }
  }
}
```

Replace `/path/to/SitrecBridge/` with the actual path where you unzipped the files.
Then restart Claude Desktop.

> **Why `run.sh` instead of `node` directly?** Claude Desktop launches MCP
> servers without sourcing your shell profile, so if you installed Node via
> nvm, fnm, or Volta, the bare `node` command won't be found. The launcher
> script locates Node automatically.

### 4. Use it

1. Open Sitrec in Chrome (e.g. `https://www.metabunk.org/sitrec`)
2. Check the extension popup — both indicators should be green
3. In Claude Code, the `sitrec_*` tools are now available

## Available Tools

| Tool | Description |
|------|-------------|
| `sitrec_status` | Check bridge connection status |
| `sitrec_list_tabs` | List all open Sitrec tabs (ID, URL, title) |
| `sitrec_get_sitch` | Get current situation info (name, frames, FPS, coordinates) |
| `sitrec_load_sitch` | Load a named sitch (e.g. `gimbal`, `chilean`) |
| `sitrec_list_sitches` | List all available sitches |
| `sitrec_list_nodes` | List all nodes in the graph (with optional filters) |
| `sitrec_get_node` | Get a node's type, connections, and value at a frame |
| `sitrec_get_frame` | Get current frame, total frames, FPS, paused state |
| `sitrec_set_frame` | Jump to a specific frame |
| `sitrec_play_pause` | Toggle or set play/pause |
| `sitrec_screenshot` | Capture the Sitrec canvas as PNG |
| `sitrec_eval` | Evaluate JavaScript in the Sitrec page context |

Most tools accept an optional `tab` parameter to target a specific Sitrec tab (by URL substring like `"build2"` or numeric Chrome tab ID). Omit to use the default (first) tab.

## MCP Resources

| URI | Description |
|-----|-------------|
| `sitrec://sitch/current` | Current sitch as JSON |
| `sitrec://nodes` | Full node graph listing |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SITREC_BRIDGE_PORT` | `9780` | WebSocket server port |

## Troubleshooting

**Extension shows "Disconnected":**
- Make sure the MCP server is running (via Claude Code or `node mcp-server.mjs`)
- Check that port 9780 isn't blocked or in use
- Click "Reconnect" in the popup

**"No Sitrec tab found":**
- Open Sitrec in Chrome (not Firefox/Safari)
- The URL must match: `metabunk.org/sitrec*`, `metabunk.org/build*`, `localhost:*/sitrec*`, `localhost:*/build*`, or `127.0.0.1:*`
- If targeting a specific tab with `tab: "build2"`, make sure that tab is open

**"Sitrec is not ready yet":**
- Wait for the page to fully load (all assets, terrain, etc.)
- The page sets `data-ready="complete"` when ready

**Timeouts:**
- Default timeout is 15 seconds per request
- Complex operations (loading sitches) may need more time
- The `sitrec_load_sitch` tool waits for the sitch to finish loading

## Development Setup

If you're working on the Sitrec codebase itself:

```bash
cd tools/SitrecBridge
npm install
```

The extension has no build step — edit files directly and reload in
`chrome://extensions/`. The MCP server also runs directly with Node.js (ESM).

For development, point your MCP config at the source file instead:

```json
{
  "mcpServers": {
    "sitrec-bridge": {
      "command": "node",
      "args": ["./tools/SitrecBridge/mcp-server.js"]
    }
  }
}
```

### Building the Distribution Zip

```bash
cd tools/SitrecBridge
npm install          # Installs deps including esbuild
npm run build        # Produces dist/SitrecBridge.zip
```

This bundles all npm dependencies into a single `mcp-server.mjs` file so end
users don't need to run `npm install`.

To regenerate placeholder icons: `node generate-icons.cjs`
