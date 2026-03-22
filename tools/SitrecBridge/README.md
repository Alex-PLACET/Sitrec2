# SitrecBridge

An MCP (Model Context Protocol) server that bridges AI assistants to a running
Sitrec instance via a Chrome extension.

## Architecture

```
Claude Code / Claude Desktop
    │  (MCP protocol, stdio)
    ▼
mcp-server.js  (Node.js)
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

## Setup

### 1. Install MCP server dependencies

```bash
cd tools/SitrecBridge
npm install
```

### 2. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `tools/SitrecBridge/extension/` directory
5. The SitrecBridge extension should appear with a blue icon

### 3. Configure Claude Code

Add to your MCP settings (`.claude/settings.json` or global settings):

```json
{
  "mcpServers": {
    "sitrec-bridge": {
      "command": "node",
      "args": ["/path/to/sitrec/tools/SitrecBridge/mcp-server.js"]
    }
  }
}
```

Or for Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sitrec-bridge": {
      "command": "node",
      "args": ["/path/to/sitrec/tools/SitrecBridge/mcp-server.js"]
    }
  }
}
```

### 4. Use it

1. Open Sitrec in Chrome (e.g. `https://local.metabunk.org/sitrec`)
2. Check the extension popup — both indicators should be green
3. In Claude Code, the `sitrec_*` tools are now available

## Available Tools

| Tool | Description |
|------|-------------|
| `sitrec_status` | Check bridge connection status |
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
- Make sure the MCP server is running (`node mcp-server.js` or via Claude Code)
- Check that port 9780 isn't blocked or in use
- Click "Reconnect" in the popup

**"No Sitrec tab found":**
- Open Sitrec in Chrome (not Firefox/Safari)
- The URL must match: `metabunk.org/sitrec*`, `localhost:*`, or `127.0.0.1:*`

**"Sitrec is not ready yet":**
- Wait for the page to fully load (all assets, terrain, etc.)
- The page sets `data-ready="complete"` when ready

**Timeouts:**
- Default timeout is 15 seconds per request
- Complex operations (loading sitches) may need more time
- The `sitrec_load_sitch` tool waits for the sitch to finish loading

## Development

The extension has no build step — edit files directly and reload in
`chrome://extensions/`. The MCP server also runs directly with Node.js (ESM).

To regenerate placeholder icons: `node generate-icons.cjs`
