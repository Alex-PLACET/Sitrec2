# Sitrec MCP Server: Final Plan

Date: March 19, 2026

## Overview

This document plans an MCP (Model Context Protocol) server for Sitrec, enabling any
MCP-compatible AI client (Claude Desktop, ChatGPT, VS Code Copilot, Cursor, custom agents)
to control Sitrec as a tool. Goals:

1. AI-guided investigation of sightings and Sitrec usage
2. Programmatic control of Sitrec (location, time, satellites, objects, video, notes)
3. Integration with external MCP servers (ADS-B, geospatial, flight data)
4. Sitch authoring, saving, and sharing from AI workflows

Reference: https://modelcontextprotocol.io/introduction

---

## 1. Current Architecture (What Exists Today)

Sitrec already has a sophisticated AI tool-use pipeline. The existing infrastructure is
essentially a proto-MCP server -- the gap is architectural, not conceptual.

```
User Chat Input
    |
CNodeViewChat.js (browser UI)
    | POST to chatbot.php with {prompt, history, sitrecDoc, menuSummary}
chatbot.php (server-side tool loop)
    | Calls OpenAI/Anthropic/Groq/Grok with tool schemas
    | Handles "query" tools server-side (listMenus, listMenuControls, getHelpDoc)
    | Returns "action" tools to client for execution
    |
CSitrecAPI.js -> handleAPICall() -> modifies browser state
```

### Already Exposable as MCP Tools

`CSitrecAPI.js` provides ~40 callable functions:
- **Scene/time/camera**: `gotoLLA`, `setDateTime`, `getCameraLLA`, `setFrame`, `getFrame`,
  `play`, `pause`, `togglePlayPause`, `getCurrentSimTime`
- **Celestial/satellites**: `pointCameraAtRaDec`, `pointCameraAtNamedObject`,
  `listCelestialObjects`, `satellitesLoadLEO`, `satellitesLoadCurrentStarlink`,
  label/flare toggles, `findSatellite`
- **Objects/models**: `addObjectAtLLA`, `listObjectFolders`, `listAvailableModels`,
  `setObjectModel`, `listAvailableGeometries`, geometry/dimension tools
- **Menu control**: `listMenus`, `listMenuControls`, `getMenuValue`, `setMenuValue`,
  `executeMenuButton`

Supporting infrastructure:
- `getDocumentation()`, `getMenuSummary()` -- API doc extraction
- `callChangesSerializedState()` -- separates transient from serializable mutations
- `CClientNLU.js` -- local fuzzy matching and math evaluation fallback; remains useful
  as a local in-app UX translator outside strict MCP flows (not replaced by MCP)
- `chatbot.php` -- server-side tool loop with rate limiting and session continuation;
  `simulateToolCall()` patterns indicate which actions can become MCP resources/read-only tools

### Save/Load/Share Already Present

- `CustomSupport.js` -- serialization, versioning, share-link generation
- `SitrecObjectResolver.js` -- `sitrec://` references and resolver-based URL resolution
- `CRehoster.js` -- file rehosting for sharing
- `getsitches.php` -- sitch listing, version listing, cross-user loading
- `object.php` -- canonical object references, presigned URLs
- `CNodeNotes.js` -- notes serialization (`notesText`, `modSerialize/modDeserialize`)

### Main Gap

The gap is not core capability; it is an external MCP-facing layer:
- Standard MCP protocol transport and tool registry
- Session model and auth boundary
- Tool policy and least privilege
- External integration contract

### Relationship Between MCP Server and chatbot.php

The existing `chatbot.php` tool loop and the new MCP server overlap significantly. The
long-term plan:

- **Phase 0-2**: `chatbot.php` continues unchanged as the in-app chatbot backend.
  The MCP server is a separate, parallel path for external AI clients.
- **Phase 3+**: As the MCP server gains persistence and notes tools, the in-app chatbot
  (`CNodeViewChat.js`) can optionally be rewired to call the MCP server instead of
  `chatbot.php` directly. This would make the in-app chat an MCP client, unifying the
  two paths.
- **Long-term**: `chatbot.php` becomes a thin adapter — it either proxies to the MCP
  server, or is retired entirely in favor of the in-app chat being a native MCP client.
  The tool schemas, session logic, and `simulateToolCall()` patterns migrate into the
  MCP server. `CClientNLU.js` remains as the local fuzzy-matching layer for the in-app
  UX, translating casual user input before it reaches MCP tools.

---

## 2. Architecture

### Hybrid: Standalone MCP Server + Browser Runtime Bridge (Recommended)

```
+---------------------------------------------------+
|  standalone-server.js (Express, port 3000)         |
|  +-- /sitrec          -> Static frontend           |
|  +-- /sitRecServer    -> PHP proxy (port 8000)     |
|  +-- /mcp             -> MCP StreamableHTTP        |
|  +-- /ws-mcp          -> WebSocket bridge          |
|                                                    |
|  sitrec-mcp-server                                 |
|  +-- Tools (40+)      -> runtime bridge or direct  |
|  +-- Resources        -> docs, sitch state, data   |
|  +-- Prompts          -> guided workflows          |
|  +-- Policy/Auth      -> scoped permissions        |
+---------------------------------------------------+
        (WebSocket)
+---------------------------------------------------+
|  Browser (Sitrec frontend)                         |
|  CSitrecAPI.js  <-- receives commands              |
|  MCPBridge.js   <-- WebSocket client               |
+---------------------------------------------------+
```

Why hybrid:
- Reuses existing rich client control primitives
- Adds robust external security/session boundary
- Keeps migration path from current chatbot tool loop to standards-based MCP
- Allows server-side query tools (Phase 6) without a browser

### Transport Options

1. **Stdio transport** (local dev): MCP server spawned by Claude Desktop / Claude Code.
   Communicates with Sitrec's running instance via HTTP/WebSocket. Simplest to start with.

2. **Streamable HTTP transport** (production): Mounted as Express route (`/mcp`). Remote
   MCP clients connect over HTTPS. SSE compatibility path for older clients.

### WebSocket Command Bridge

Server side (standalone-server.js):
```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server: httpServer, path: '/ws-mcp' });
const pendingCallbacks = new Map();

// Session-to-socket binding: each MCP session registers its target runtime
// socket during the initial handshake. This replaces the naive
// [...wss.clients][0] placeholder and supports runtime leasing.
const sessionSockets = new Map(); // sessionId -> ws

wss.on('connection', (ws, req) => {
    const runtimeId = req.headers['x-sitrec-runtime-id'] || crypto.randomUUID();
    ws.runtimeId = runtimeId;

    ws.on('message', (msg) => {
        const { id, result } = JSON.parse(msg);
        pendingCallbacks.get(id)?.(result);
    });

    ws.on('close', () => {
        // Remove any sessions bound to this socket
        for (const [sid, sock] of sessionSockets) {
            if (sock === ws) sessionSockets.delete(sid);
        }
    });
});

function bindSession(sessionId, runtimeId) {
    const ws = [...wss.clients].find(c => c.runtimeId === runtimeId);
    if (!ws) throw new Error('NO_RUNTIME');
    sessionSockets.set(sessionId, ws);
}

// This is the low-level bridge call. The MCP tool implementations import a
// higher-level wrapper from bridge.ts as `callSitrecBridge(fn, args)` which
// binds the sessionId internally from the current MCP request context.
function callSitrecBridge(sessionId, fn, args) {
    return new Promise((resolve, reject) => {
        const ws = sessionSockets.get(sessionId)
            || [...wss.clients].values().next().value; // fallback for single-runtime
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return reject(new Error('NO_RUNTIME'));
        }
        const id = crypto.randomUUID();
        const timeout = setTimeout(() => {
            pendingCallbacks.delete(id);
            reject(new Error('TIMEOUT'));
        }, 10000);
        pendingCallbacks.set(id, (result) => {
            clearTimeout(timeout);
            pendingCallbacks.delete(id);
            resolve(result);
        });
        ws.send(JSON.stringify({ id, fn, args }));
    });
}
```

Browser side (new file: src/MCPBridge.js):
```javascript
const ws = new WebSocket(`ws://${location.host}/ws-mcp`);
ws.onmessage = (event) => {
    const { id, fn, args } = JSON.parse(event.data);
    const result = sitrecAPI.handleAPICall({ fn, args });
    ws.send(JSON.stringify({ id, result }));
};
```

### Bridge Contract

Formal request/response envelope for deterministic bridge behavior:

Request:
```json
{
  "id": "uuid",
  "sessionId": "mcp-session-id",
  "fn": "setDateTime",
  "args": { "dateTime": "2026-03-19T20:30:00-07:00" },
  "idempotencyKey": "optional-key"
}
```

Response:
```json
{
  "id": "uuid",
  "ok": true,
  "result": { "applied": true },
  "error": null,
  "runtimeSessionId": "sitrec-runtime-id"
}
```

Required semantics:
- Hard timeout per call (10s default, override for long-running ops like satellite loading)
- Defined error codes: `NO_RUNTIME`, `TIMEOUT`, `INVALID_ARGS`, `RUNTIME_ERROR`, `UNAUTHORIZED`
- Correlated in-flight map by `id`
- One active runtime per MCP session by default
- Retry only for transport failures; do not auto-retry non-idempotent mutating calls

### Transport Rollout Strategy

1. Start with `stdio` transport for local desktop agents.
2. Add Streamable HTTP endpoint for remote/shared deployments.
3. Keep a single tool registry and shared schemas across both transports.

### Browser Dependency and Headless Track

- **Near-term**: Browser bridge is required for scene mutation and view-dependent actions
  (anything that touches Three.js, the node graph, or the GUI).
- **Mid-term**: Extract headless computation tools (coordinate transforms, satellite
  visibility, sitch metadata queries) so read-only analytics can run without a connected
  browser. This is Phase 6 in the implementation plan.

---

## 3. Security / Auth / Session Model

### Authorization Model

Default to read-only toolset, then add scoped write sets:
- `scene.read`, `scene.write`
- `satellites.read`, `satellites.write`
- `sitch.read`, `sitch.write`
- `notes.read`, `notes.write`
- `admin.featured.write` (admin only)

Policy requirements:
- Per-tool allowlists per session
- Human approval for write/destructive tools unless explicitly disabled
- Clear separation of read-only and mutating tools via MCP `annotations`

### Session Model
- MCP session ID maps to Sitrec runtime session (active browser tab)
- Session TTL, heartbeat, and explicit termination
- Idempotency keys for non-idempotent operations (save/share/rehost flows)
- Runtime leasing: prevent two MCP sessions from mutating the same runtime simultaneously
  unless explicitly allowed
- Graceful handling of "no browser connected" state

### Reuse Existing Hardening
Current code already includes critical security pieces:
- CORS allowlists in `getsitches.php`, `metadata.php`, `object.php`
- Input/path validation in `getsitches.php`, `metadata.php`, `rehost.php`, `object.php`
- Rate limiting in `proxy.php`, `proxyStarlink.php`, `chatbot.php`
- Storage/object access controls and presigned URL logic in `object.php`, `rehost.php`

### MCP-Specific Controls
- Strict JSON-schema validation on tool inputs/outputs (via Zod)
- Tool-level rate limits and quotas
- Prompt-injection-aware execution policy for open-world tools
- Full audit logs for write actions and data-exporting tools
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) on every tool

---

## 4. Tool Design

### Naming Convention

- Use dot-namespaced families (e.g. `sitrec.scene.configure`)
- Use snake_case at leaf action names for cross-client compatibility
- Keep aliases only for migration (e.g. accept both `share_link` and `get_share_link`,
  normalize internally) to avoid breaking existing integrations during transition

### Tool Families

Tools use dot-namespaced families for organization, with snake_case for MCP compatibility:

- `sitrec.scene.*` -- location, time, camera, playback
- `sitrec.satellites.*` -- loading, filtering, searching, labels
- `sitrec.objects.*` -- 3D object creation and manipulation
- `sitrec.menus.*` -- generic GUI menu read/write (fallback)
- `sitrec.sitch.*` -- save, load, list, share, export
- `sitrec.notes.*` -- read, set, append notes
- `sitrec.workflow.*` -- guided multi-step workflows
- `sitrec.flight_tracks.*` -- track loading (Phase 5, tools TBD per ADSBX plans)
- `sitrec.query.*` -- headless computation (Phase 6)

### Scene Tools

#### `sitrec.scene.configure` (Composite)

Sets multiple scene properties in one call, reducing round-trips:

```json
{
  "name": "sitrec.scene.configure",
  "description": "Set scene date/time, camera LLA, frame, and playback in one call.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "dateTime": { "type": "string", "format": "date-time" },
      "camera": {
        "type": "object",
        "properties": {
          "lat": { "type": "number" },
          "lon": { "type": "number" },
          "alt": { "type": "number" }
        }
      },
      "frame": { "type": "integer", "minimum": 0 },
      "paused": { "type": "boolean" }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "applied": { "type": "array", "items": { "type": "string" } },
      "simTime": { "type": "string", "format": "date-time" },
      "frame": { "type": "integer" }
    },
    "required": ["applied"]
  },
  "annotations": {
    "readOnlyHint": false, "destructiveHint": false,
    "idempotentHint": true, "openWorldHint": false
  }
}
```

#### Individual Scene Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `sitrec.scene.goto_location` | Move camera to lat/lon/alt | `lat`, `lon`, `alt?` |
| `sitrec.scene.set_datetime` | Set simulation date/time | `dateTime` (ISO 8601) |
| `sitrec.scene.get_camera` | Get current camera LLA | -- |
| `sitrec.scene.set_camera_altitude` | Change camera altitude | `alt` (meters) |
| `sitrec.scene.point_camera_radec` | Point at RA/Dec | `ra`, `dec` |
| `sitrec.scene.point_camera_object` | Point at celestial body | `object` |
| `sitrec.scene.set_frame` | Jump to frame | `frame` |
| `sitrec.scene.play` | Start playback | -- |
| `sitrec.scene.pause` | Pause playback | -- |
| `sitrec.scene.get_sim_time` | Get current sim time | -- |
| `sitrec.scene.list_celestial_objects` | List pointable objects | -- |

### Satellite Tools

#### `sitrec.satellites.load`

```json
{
  "name": "sitrec.satellites.load",
  "description": "Load satellite data for simulation date.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mode": { "type": "string", "enum": ["leo_for_date", "current_starlink"] }
    },
    "required": ["mode"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "mode": { "type": "string" },
      "statusText": { "type": "string" }
    },
    "required": ["success", "mode"]
  },
  "annotations": {
    "readOnlyHint": false, "destructiveHint": false,
    "idempotentHint": true, "openWorldHint": false
  }
}
```

| Tool | Description | Key Parameters |
|---|---|---|
| `sitrec.satellites.load` | Load LEO or Starlink | `mode` |
| `sitrec.satellites.find` | Search by name | `name` |
| `sitrec.satellites.show` | Show/hide categories | `category`, `visible` |
| `sitrec.satellites.toggle_labels` | Control labels | `view`, `visible` |
| `sitrec.satellites.toggle_flare_region` | Toggle flare viz | `visible` |

### Object & Model Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `sitrec.objects.add` | Create 3D object at LLA | `lat`, `lon`, `alt`, `name?` |
| `sitrec.objects.set_model` | Set to 3D model | `object`, `model` |
| `sitrec.objects.set_geometry` | Set to procedural shape | `object`, `geometry` |
| `sitrec.objects.set_dimensions` | Resize | `object`, `width`, `height?`, `depth?` |
| `sitrec.objects.list_models` | List available models | -- |
| `sitrec.objects.list_geometries` | List geometry types | -- |
| `sitrec.objects.list_folders` | List object folders | -- |

### Menu Tools (Generic Fallback)

| Tool | Description | Key Parameters |
|---|---|---|
| `sitrec.menus.set_value` | Set any menu control | `menu`, `path`, `value` |
| `sitrec.menus.get_value` | Read any menu control | `menu`, `path` |
| `sitrec.menus.list` | List available menus | -- |
| `sitrec.menus.list_controls` | List controls in a menu | `menu` |
| `sitrec.menus.execute_button` | Click a menu button | `menu`, `path` |

### Sitch Management Tools

#### `sitrec.sitch.save`

```json
{
  "name": "sitrec.sitch.save",
  "description": "Save current sitch to server or local.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "target": { "type": "string", "enum": ["server", "local"] },
      "returnPermalink": { "type": "boolean" }
    },
    "required": ["target"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "sitchName": { "type": "string" },
      "versionRef": { "type": "string" },
      "shareUrl": { "type": "string" }
    },
    "required": ["success"]
  },
  "annotations": {
    "readOnlyHint": false, "destructiveHint": false,
    "idempotentHint": false, "openWorldHint": false
  }
}
```

| Tool | Description | Key Parameters |
|---|---|---|
| `sitrec.sitch.load` | Load built-in sitch | `name` |
| `sitrec.sitch.list` | List available sitches | -- |
| `sitrec.sitch.save` | Save current state | `name`, `target` |
| `sitrec.sitch.get_share_link` | Generate shareable URL | -- |
| `sitrec.sitch.get_state` | Export as JSON | -- |
| `sitrec.sitch.list_versions` | List saved versions | `name` |

### Notes Tools

#### `sitrec.notes.update`

```json
{
  "name": "sitrec.notes.update",
  "description": "Set or append notes saved with the sitch.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mode": { "type": "string", "enum": ["set", "append"] },
      "text": { "type": "string" }
    },
    "required": ["mode", "text"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "chars": { "type": "integer" }
    },
    "required": ["success"]
  },
  "annotations": {
    "readOnlyHint": false, "destructiveHint": false,
    "idempotentHint": false, "openWorldHint": false
  }
}
```

| Tool | Description | Key Parameters |
|---|---|---|
| `sitrec.notes.read` | Get current notes text | -- |
| `sitrec.notes.update` | Set or append notes | `mode`, `text` |

### Workflow Tools

#### `sitrec.workflow.recreate_sighting`

Exposed as both a tool (structured return) and a prompt (conversational guidance):

```json
{
  "name": "sitrec.workflow.recreate_sighting",
  "description": "Guided sighting recreation. Returns structured checklist.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "dateTime": { "type": "string", "format": "date-time" },
      "location": {
        "type": "object",
        "properties": {
          "lat": { "type": "number" },
          "lon": { "type": "number" },
          "alt": { "type": "number" }
        }
      },
      "direction": { "type": "string" },
      "satelliteMode": {
        "type": "string",
        "enum": ["none", "leo_for_date", "current_starlink"]
      },
      "description": { "type": "string" },
      "assetRefs": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional sitrec:// or URL references to videos/tracks to load"
      }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "checklist": { "type": "array", "items": { "type": "string" } },
      "warnings": { "type": "array", "items": { "type": "string" } },
      "nextBestAction": { "type": "string" },
      "shareUrl": { "type": "string" }
    },
    "required": ["checklist"]
  },
  "annotations": {
    "readOnlyHint": false, "destructiveHint": false,
    "idempotentHint": false, "openWorldHint": false
  }
}
```

### Data Query Tools (Headless -- Phase 6)

| Tool | Description | Key Parameters |
|---|---|---|
| `sitrec.query.satellites_at_time` | Visible satellites | `lat`, `lon`, `dateTime`, `minElevation?` |
| `sitrec.query.celestial_position` | Body position | `object`, `dateTime`, `lat`, `lon` |
| `sitrec.query.coordinate_convert` | LLA/ECEF/ENU convert | `from`, `to`, `coords` |

---

## 5. MCP Resources

Resources provide read-only context that AI clients can pull into their context window:

| URI Pattern | Description |
|---|---|
| `sitrec://docs/{docName}` | Help docs (WhatsNew, UserInterface, Starlink, etc.) |
| `sitrec://sitches` | List of all available sitches with descriptions |
| `sitrec://state/current` | Current sitch state (camera, time, loaded data) |
| `sitrec://state/menus` | Full menu structure and current values |
| `sitrec://data/tracks` | Currently loaded track data |
| `sitrec://data/satellites` | Currently loaded satellite catalog |

Resources replace the need for the bulky system-prompt menu documentation that
`chatbot.php` currently injects. AI clients fetch resources on demand.

**Bridge dependency**: `sitrec://docs/*` and `sitrec://sitches` can be served directly
from the filesystem/PHP endpoints (no browser needed). `sitrec://state/*` and
`sitrec://data/*` require the browser bridge since they reflect live runtime state.
This is why resources are Phase 3, after the bridge is built in Phase 2.

### Resource Shapes

Resources return structured JSON. Example shape for `sitrec://state/current`:

```json
{
  "type": "object",
  "properties": {
    "dateTime": { "type": "string", "format": "date-time" },
    "frame": { "type": "integer" },
    "totalFrames": { "type": "integer" },
    "paused": { "type": "boolean" },
    "cameraLLA": {
      "type": "object",
      "properties": {
        "lat": { "type": "number" },
        "lon": { "type": "number" },
        "alt": { "type": "number" }
      }
    },
    "loaded": {
      "type": "object",
      "properties": {
        "satellites": { "type": "boolean" },
        "tracks": { "type": "integer" },
        "sitchName": { "type": "string" }
      }
    }
  }
}
```

---

## 6. MCP Prompts

Prompts are guided workflow templates that users invoke explicitly (e.g. as slash commands
in Claude Desktop).

### `investigate_sighting`

Primary use case. The user describes what they saw, AI walks through setup:

```
Arguments: location (required), date (required), time (required),
           direction (optional), description (optional)

Expected tool chain:
  - sitrec.scene.configure
  - sitrec.satellites.load
  - sitrec.scene.point_camera_radec or sitrec.scene.point_camera_object
  - sitrec.satellites.find
  - sitrec.notes.update
  - sitrec.sitch.get_share_link

Workflow:
  1. Geocode location if needed (via Maps MCP or built-in)
  2. Set location and time (sitrec.scene.configure)
  3. Load satellites (sitrec.satellites.load)
  4. Point camera in described direction
  5. Search for matching objects (satellites, stars, planets)
  6. Document findings (sitrec.notes.update mode:append)
  7. Generate share link (sitrec.sitch.get_share_link)
```

The `expectedToolChain` metadata helps clients pre-authorize tools or plan execution.

### `setup_video_comparison`

```
Arguments: video_url?, location?, date?
Workflow: Load video, set FOV, align time, adjust camera to match perspective
```

### `identify_object`

```
Arguments: lat, lon, dateTime, azimuth, elevation
Workflow: Check satellites, stars, planets, ISS, aircraft at the specified
          direction from the specified location
```

### `get_flight_data`

```
Arguments: location, date, time_range
Workflow: Explain how to get ADS-B data. If ADS-B Exchange MCP is available,
          query it directly. Guide through loading KML files.
```

---

## 7. Integration with External MCP Servers

Keep the Sitrec MCP server as the authoritative simulation-state owner. Use external
servers for supplemental data and workflow enrichment.

### Available Ecosystem Servers

| Server | How It Helps Sitrec Users |
|---|---|
| **ADS-B Exchange MCP** | Real-time and historical aircraft data -- "what planes were near Phoenix at 9pm?" |
| **Flightradar24 MCP** (community) | Historical flight data for recreating aircraft encounters (third-party, not official FR24) |
| **Google Maps MCP** | Geocoding, elevation data, POI search |
| **Mapbox MCP** | Geospatial routing, map imagery |
| **GIS MCP** | Coordinate transforms, geospatial operations |
| **Playwright MCP** | Browser automation for screenshots or UI testing |
| **Filesystem MCP** | Read/write local KML, CSV, video files |
| **Fetch/Web MCP** | Source retrieval and citation workflows complementing analysis output |

References:
- ADS-B Exchange MCP: https://www.pulsemcp.com/servers/adsb-exchange
- Flightradar24 MCP: https://mcpservers.org/servers/Cyreslab-AI/flightradar-mcp-server
- Mapbox MCP: https://github.com/mapbox/mcp-server
- GIS MCP: https://github.com/mahdin75/gis-mcp
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Google Maps MCP: https://www.pulsemcp.com/servers/modelcontextprotocol-google-maps

### Composite Workflow Example

User: *"I saw a bright light moving east to west over Denver at 8:30 PM last Tuesday."*

AI using multiple MCP servers:
1. **Google Maps MCP** -> geocode "Denver" -> lat: 39.7392, lon: -104.9903
2. **Sitrec MCP** -> `sitrec.scene.configure({dateTime, camera: {lat, lon, alt: 1609}})`
3. **Sitrec MCP** -> `sitrec.satellites.load({mode: "leo_for_date"})` -> point camera west
4. **ADS-B Exchange MCP** -> query aircraft near Denver at that time
5. **Sitrec MCP** -> `sitrec.notes.update({mode: "append", text: "Investigation: ..."})`
6. **Sitrec MCP** -> `sitrec.sitch.get_share_link()`

### Vendor Interop Notes

Different MCP clients have different constraints:
- **OpenAI / ChatGPT**: Remote MCP support via Streamable HTTP; Developer mode for broader tool use
- **Anthropic / Claude**: MCP connector is tools-focused; currently constrained to publicly exposed HTTP MCP servers (for cloud Claude -- Claude Desktop works with local stdio)
- **GitHub Copilot coding agent**: Tools only, no resources/prompts; current remote OAuth limitations
- **Claude Code / Claude Desktop**: Full MCP support including stdio, resources, prompts

**Portability rule**: Build and test a tools-only baseline first (works for all constrained
clients). Layer resources and prompts as progressive enhancement for clients that support
them. This means every workflow must be achievable with tools alone; resources/prompts
just make it smoother.

References:
- OpenAI MCP guide: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- Anthropic MCP connector: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- Copilot coding agent MCP: https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent

---

## 8. Implementation Skeleton

Using the official TypeScript SDK (`@modelcontextprotocol/sdk`):

```typescript
// sitrec-mcp-server/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callSitrecBridge } from "./bridge.js";

const server = new McpServer({
  name: "sitrec-mcp-server",
  version: "1.0.0",
});

// -- Composite scene tool --

server.registerTool(
  "sitrec.scene.configure",
  {
    title: "Configure Scene",
    description:
      "Set scene date/time, camera position, frame, and playback in one call. " +
      "All properties are optional -- only provided ones are applied.",
    inputSchema: z.object({
      dateTime: z.string().optional().describe("ISO 8601 date-time string"),
      camera: z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        alt: z.number().optional().default(0),
      }).optional().describe("Camera position as lat/lon/alt"),
      frame: z.number().int().min(0).optional().describe("Frame number"),
      paused: z.boolean().optional().describe("Pause state"),
    }),
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: true, openWorldHint: false,
    },
  },
  async (params) => {
    const applied = [];
    if (params.camera) {
      await callSitrecBridge("gotoLLA", params.camera);
      applied.push("camera");
    }
    if (params.dateTime) {
      await callSitrecBridge("setDateTime", { dateTime: params.dateTime });
      applied.push("dateTime");
    }
    if (params.frame !== undefined) {
      await callSitrecBridge("setFrame", { frame: params.frame });
      applied.push("frame");
    }
    if (params.paused !== undefined) {
      await callSitrecBridge(params.paused ? "pause" : "play", {});
      applied.push("paused");
    }
    const simTime = await callSitrecBridge("getCurrentSimTime", {});
    return {
      content: [{ type: "text", text: JSON.stringify({ applied, ...simTime }) }],
      structuredContent: { applied, ...simTime },
    };
  }
);

// -- Individual tools --

server.registerTool(
  "sitrec.satellites.load",
  {
    title: "Load Satellites",
    description: "Load satellite TLE data. Use 'leo_for_date' for all LEO sats, " +
      "'current_starlink' for latest Starlink constellation.",
    inputSchema: z.object({
      mode: z.enum(["leo_for_date", "current_starlink"]),
    }),
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: true, openWorldHint: false, // loading same dataset twice = same end state
    },
  },
  async (params) => {
    const fn = params.mode === "current_starlink"
      ? "satellitesLoadCurrentStarlink"
      : "satellitesLoadLEO";
    await callSitrecBridge(fn, {});
    return {
      content: [{ type: "text", text: `Loaded satellites (${params.mode}).` }],
      structuredContent: { success: true, mode: params.mode },
    };
  }
);

server.registerTool(
  "sitrec.notes.update",
  {
    title: "Update Notes",
    description: "Set or append text to the sitch notes.",
    inputSchema: z.object({
      mode: z.enum(["set", "append"]),
      text: z.string().min(1),
    }),
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: false,
    },
  },
  async (params) => {
    // Append is a single atomic bridge call — the browser side handles
    // read-current + concatenate + write so there's no TOCTOU race
    // between concurrent MCP sessions.
    await callSitrecBridge("updateNotes", {
      mode: params.mode,
      text: params.text,
    });
    return {
      content: [{ type: "text", text: "Notes updated." }],
      structuredContent: { success: true, chars: params.text.length },
    };
  }
);

// ... additional tools for all families ...

// -- Resources --

server.registerResource(
  "sitrec://docs/{docName}",
  { title: "Sitrec Documentation", description: "Help documentation files" },
  async (uri) => {
    const docName = uri.pathname.split("/").pop();
    const content = await readDocFile(docName);
    return {
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
    };
  }
);

// -- Prompts --

server.registerPrompt(
  "investigate_sighting",
  {
    title: "Investigate a Sky Sighting",
    description: "Guided workflow to investigate an unidentified aerial observation",
    arguments: [
      { name: "location", description: "Where it occurred", required: true },
      { name: "date", description: "Date of sighting", required: true },
      { name: "time", description: "Time of sighting", required: true },
      { name: "direction", description: "Direction observed", required: false },
      { name: "description", description: "What was seen", required: false },
    ],
  },
  async (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Investigate a sighting. Details:
Location: ${args.location}
Date: ${args.date}
Time: ${args.time}
Direction: ${args.direction || "unknown"}
Description: ${args.description || "unspecified"}

Use Sitrec tools to:
1. Set the location and time (sitrec.scene.configure)
2. Load satellites (sitrec.satellites.load)
3. Check celestial objects in that direction
4. Document findings (sitrec.notes.update mode:append)
5. Generate a share link (sitrec.sitch.get_share_link)`,
      },
    }],
  })
);

// -- Transport --

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "sitrec": {
      "command": "node",
      "args": ["/path/to/sitrec-mcp-server/dist/index.js"],
      "env": {
        "SITREC_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## 9. Project Structure

```
sitrec-mcp-server/
+-- package.json
+-- tsconfig.json
+-- src/
|   +-- index.ts              # Entry point, transport setup
|   +-- bridge.ts             # WebSocket bridge to Sitrec browser
|   +-- policy.ts             # Auth scopes, rate limits, audit
|   +-- tools/
|   |   +-- scene.ts          # scene.configure, goto, camera, frame
|   |   +-- satellites.ts     # load, find, show, labels, flare
|   |   +-- objects.ts        # add, model, geometry, dimensions
|   |   +-- menus.ts          # generic menu read/write
|   |   +-- sitch.ts          # save, load, list, share, export
|   |   +-- notes.ts          # read, update (set/append)
|   |   +-- workflow.ts       # recreate_sighting, identify, etc.
|   |   +-- query.ts          # headless computation (Phase 6)
|   +-- resources/
|   |   +-- docs.ts           # Help documentation
|   |   +-- state.ts          # Current sitch state
|   |   +-- data.ts           # Track/satellite data
|   +-- prompts/
|   |   +-- investigate.ts    # Sighting investigation
|   |   +-- video-compare.ts  # Video comparison setup
|   |   +-- identify.ts       # Object identification
|   +-- schemas/              # Shared Zod schemas
+-- dist/
```

---

## 10. Phased Implementation Plan

### Phase 0 (1 week): First-Class Tool Surfacing

Before building the MCP server, promote missing capabilities into `CSitrecAPI.js`:
- `getNotes()` / `setNotes(text)` / `updateNotes(mode, text)` -- read/write/atomic-append
  notes (append must be atomic on the browser side to avoid TOCTOU with concurrent sessions)
- `saveSitch(name, target)` -- trigger save workflow
- `getShareLink()` -- generate share URL
- `loadSitch(name)` -- load built-in sitch
- `listSitches()` -- list available sitches
- `getSitchState()` -- export current state as JSON

Keep generic menu tools as fallback for anything not yet promoted.

**Milestone**: Stable internal tool contract (names, args, error model) that MCP can wrap.

### Phase 1 (1-2 weeks): MCP Server Skeleton (Read-Only, No Bridge Needed)

- Create `sitrec-mcp-server/` package
- Implement stdio transport with read-only tools that call PHP endpoints directly:
  `listSitches` (via `getsitches.php`), `listMenus`, `listMenuControls`, `getHelpDoc`
- Schema validation via Zod
- Auth middleware and session store
- Test with Claude Desktop

**Milestone**: Local Claude Desktop can list and call read-only Sitrec tools without
needing a browser open. Useful for exploration and documentation queries.

### Phase 2 (1-2 weeks): Runtime Bridge + Write Tools

- Add WebSocket bridge to `standalone-server.js` and `src/MCPBridge.js`
- Implement bridge contract (envelopes, error codes, timeouts)
- Add write/mutation tools that require the browser bridge:
  `scene.configure`, `satellites.load`, `objects.add`, `menus.set_value`, etc.

**Milestone**: Live scene mutation tools execute reliably against active runtime.

### Phase 3 (1 week): Resources and Prompts

- Add documentation resources from `docs/*.md`
- Add state/menu/data resources with defined shapes
- Add `investigate_sighting` and other prompts with `expectedToolChain`

**Milestone**: Prompt size reduction; better tool discoverability in MCP clients.

### Phase 4 (1-2 weeks): Persistence and Notes Tools

- Wrap save/load/version/share stack as MCP tools
- Notes CRUD backed by `CNodeNotes`
- Idempotency keys for save operations

**Milestone**: Full recreate-save-share-notes loop works end to end via MCP.

### Phase 5 (1-2 weeks): Flight Data Tools

- Implement ADS-B proxy + loader tools per existing ADSBX plans
- Add progress-aware long-running tool patterns
- Integration with ADS-B Exchange MCP if available

**Milestone**: Historical flight ingestion integrated in reproducible workflow.

### Phase 6 (1-2 weeks): Headless Query Tools

- Extract pure computation to run without browser runtime
- Candidate tools: coordinate conversion, satellite visibility, sitch metadata queries
- These tools respond even when no browser is connected

**Milestone**: Read-only analytics available when no runtime is attached.

### Phase 7 (1 week): Vendor Interop and Hardening

- Streamable HTTP transport for remote access
- OpenAI, Anthropic, Copilot interop profiles (narrower write scopes for Copilot)
- Security review: scope enforcement, rate limits, audit logs
- Regression, load, and resilience tests

**Milestone**: Production-ready profile matrix and release checklist.

---

## 11. Architectural Comparison

| Aspect | Current (chatbot.php) | MCP Server |
|---|---|---|
| Schema definition | Parsed from description strings | Typed Zod schemas with outputSchema |
| Client compatibility | In-app chatbot only | Any MCP client |
| Tool discovery | Bespoke system prompt | Standard `tools/list` protocol |
| Menu docs | Serialized into system prompt | On-demand MCP resources |
| External data | Manual (user fetches flight data) | Composable with ADS-B/Maps/GIS MCP |
| Server-side queries | `simulateToolCall()` hack | Native MCP resources + headless tools |
| Security model | Rate limiting only | Scoped permissions, audit, policy |
| State change tracking | `callChangesSerializedState()` | MCP annotations + same logic |

---

## 12. Risks

- **Runtime/session drift**: MCP session and active browser tab can get out of sync.
  Mitigate with heartbeat and explicit session binding.
- **Over-broad write exposure**: Autonomous agents calling destructive tools without
  confirmation. Mitigate with `destructiveHint` annotations and per-tool allowlists.
- **Vendor auth/protocol mismatch**: Different clients support different MCP features.
  Design tools-first, add resources/prompts for clients that support them.
- **Long-running operations**: Satellite loading and ADS-B ingestion can take time.
  Use progress notifications or async patterns.
- **No browser connected**: MCP server running but no Sitrec tab open. Return `NO_RUNTIME`
  error for browser-dependent tools; headless query tools (Phase 6) work without a browser.
- **Multi-session concurrency**: Two MCP sessions mutating the same runtime. Runtime
  leasing prevents this by default; needs clear error messaging when a lease is denied.

---

## 13. Test Strategy

- **Unit**: Schema validation, policy enforcement, scope resolution, bridge serialization,
  error code mapping
- **Integration**: Each tool family against mocked runtime bridge + real PHP endpoints
- **E2E (Playwright)**: Full workflows -- recreate sighting, load satellites, save/share,
  notes update, verify in browser
- **Resilience**: Bridge disconnect/reconnect, timeout handling, idempotency/retry
  behavior, runtime leasing conflicts, no-browser-connected graceful degradation
- **Security**: Path traversal, CORS/origin, scope escalation, prompt injection through
  tool inputs, rate limit enforcement

---

## 14. File-Level Integration Points

### Client-Side
- `src/CSitrecAPI.js` -- primary tool surface (extend in Phase 0)
- `src/nodes/CNodeVIewChat.js` -- existing chatbot (evolves alongside MCP)
- `src/CFileManager.js` -- file loading and parsing
- `src/CustomSupport.js` -- serialization, save/share workflows
- `src/CRehoster.js` -- file rehosting for sharing
- `src/SitrecObjectResolver.js` -- `sitrec://` reference resolution
- `src/nodes/CNodeNotes.js` -- notes persistence
- `src/MCPBridge.js` -- NEW: WebSocket bridge client

### Server-Side
- `standalone-server.js` -- add WebSocket server and MCP route
- `sitrecServer/chatbot.php` -- existing AI orchestration (reference)
- `sitrecServer/getsitches.php` -- sitch listing and versions
- `sitrecServer/metadata.php` -- file metadata
- `sitrecServer/rehost.php` -- file rehosting
- `sitrecServer/object.php` -- object resolution and presigned URLs
- `sitrecServer/proxy.php` -- external service proxy
- `sitrecServer/proxyStarlink.php` -- Starlink TLE proxy

### Related Docs/Plans
- `docs/Starlink.md`, `docs/CustomSitchTool.md`, `docs/LocalCustomSitches.md`, `docs/UserInterface.md`, `docs/WhatsNew.md`
- `ADSBX_INTEGRATION_PLAN.md`, `ADSBX_HISTORICAL_DATA_PLAN.md`

---

## 15. References

### MCP Specification
- Introduction: https://modelcontextprotocol.io/introduction
- Tools: https://modelcontextprotocol.io/docs/concepts/tools
- Resources: https://modelcontextprotocol.io/docs/concepts/resources
- Prompts: https://modelcontextprotocol.io/docs/concepts/prompts
- Build a Server: https://modelcontextprotocol.io/docs/develop/build-server
- Transports: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- Authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Schema: https://modelcontextprotocol.io/specification/2025-11-25/schema

### SDKs and Servers
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Node MCP Server Guide: https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server.md
- Official MCP Servers: https://github.com/modelcontextprotocol/servers

### Vendor Integration
- OpenAI MCP Guide: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI Building MCP Servers: https://developers.openai.com/api/docs/mcp
- Anthropic MCP Connector: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- Copilot Coding Agent MCP: https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent

### Architecture Patterns
- REST to MCP: https://www.stainless.com/mcp/from-rest-api-to-mcp-server
- MCP Architecture Guide: https://www.stainless.com/mcp/api-mcp-server-architecture-guide

### Ecosystem Servers
- ADS-B Exchange MCP: https://www.pulsemcp.com/servers/adsb-exchange
- Flightradar24 MCP: https://mcpservers.org/servers/Cyreslab-AI/flightradar-mcp-server
- Mapbox MCP: https://github.com/mapbox/mcp-server
- GIS MCP: https://github.com/mahdin75/gis-mcp
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Google Maps MCP: https://www.pulsemcp.com/servers/modelcontextprotocol-google-maps
