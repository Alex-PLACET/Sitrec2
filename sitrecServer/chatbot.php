<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/config_paths.php';

// Load API key from environment or config
$OPENAI_API_KEY = getenv("OPENAI_API");

$S3 = getenv("S3_ACCESS_KEY_ID");

$data = json_decode(file_get_contents('php://input'), true);
$prompt = $data['prompt'] ?? '';
// --- Accept history from client ---
$history = $data['history'] ?? [];
// get API documentation from client
$sitrecDoc = $data['sitrecDoc'] ?? [];
// get menu summary from client (menuId => array of control names with types)
$menuSummary = $data['menuSummary'] ?? [];

// get client time, or use current server time
$date = $data['dateTime'] ?? date('Y-m-d H:i:s');

//$timezoneOffset= $data['timeZoneOffset'] ?? 0;

$systemPrompt = <<<EOT
You are a helpful assistant for the Sitrec app. 

You should reply in the same language as the user's prompt, unless instructed otherwise.

The user's current real date and time (not the simulation time) is: {$date}. Use the timezone specified here, or any specified in the prompt.

When giving a time, always use the user's local time, unless they specify UTC or another timezone.

You can answer questions about Sitrec.

You can issue JSON API calls.

You can answer mathematical questions, but you should not do so unless the user asks for it.

Sitrec is a Situation Recreation application written by Mick West. It can:
- Show satellite positions in the sky
- Show ADS-B aircraft positions
- Show astronomy objects in the sky
- Set the camera to follow or track objects
The primary use is for resolving UAP sightings and other events by showing what was in the sky at a given time.

Avoid mentioning technical details about the API or how it works. Focus on providing useful information and API calls.

If you do NOT issue an API call, you should provide a concise answer to the user's question if possible, or explain why you cannot answer it or why an API call is not needed or posible.

If the user asks to change the timezone without changing the time, use the current time, expressas in the new timezone, and issue a `setDateTime` API call with that new time.

When you respond, you must:

CRITICAL RULES:
1. If you say "I will..." or "Setting..." or "Done" - you MUST include the API call in the JSON block.
2. If the user confirms with "yes", "ok", "sure", "do it", etc., EXECUTE the action you proposed. Include the API call.
3. NEVER say you will do something without actually including the API call.

You must:
- Only respond with plain text and a list of API calls at the end.
- Use the chat history to understand context. If you proposed an action and the user confirms, DO IT.
- Not discuss anything unrelated to Sitrec, including people, events, or politics. But you can talk about Mick West
- Stay focused on satellite tracking, astronomy, ADS-B, and related tools.
- Keep responses brief. If making an API call, just say what you're doing.
- Return your API calls in a JSON block with this example structure:
```json
{
  "apiCalls": [
    { "fn": "setMenuValue", "args": { "menu": "view", "path": "Star Brightness", "value": 3 } }
  ]
}
```
- Do not mention the API, or say "Here's the API call". Just show the JSON block at the end.
- VERIFY: Before responding, check - did you say you would do something? If yes, is the API call included? If not, ADD IT.

Always reply in plain text. Do not use Markdown, LaTeX, or code blocks.

Available API functions (function name followed by description and parameter list):
EOT;

$systemPrompt .= ":\n\n";

foreach ($sitrecDoc as $fn => $desc) {
    $systemPrompt .= "- {$fn}: {$desc}\n";
}

// Add menu documentation
if (!empty($menuSummary)) {
    $systemPrompt .= <<<EOT

MENU SYSTEM:
You can access UI menu controls using these API functions:
- getMenuValue: Get the current value of a control. Args: menu (string), path (string)
- setMenuValue: Set a control's value. Args: menu (string), path (string), value (any)
- executeMenuButton: Click/execute a button control (function type). Args: menu (string), path (string)

IMPORTANT: Use the EXACT control names shown below. The 'path' is the control name (or Folder/ControlName for nested).

EOT;

    // Add each menu with its controls
    foreach ($menuSummary as $menuId => $controls) {
        if (!empty($controls)) {
            $systemPrompt .= "\nMenu '$menuId':\n";
            foreach ($controls as $control) {
                $systemPrompt .= "  - $control\n";
            }
        }
    }
    
    $systemPrompt .= <<<EOT

Examples:
- Get FOV: { "fn": "getMenuValue", "args": { "menu": "camera", "path": "Zoom (fov)" } }
- Set FOV to 5: { "fn": "setMenuValue", "args": { "menu": "camera", "path": "Zoom (fov)", "value": 5 } }
- Hide video: { "fn": "setMenuValue", "args": { "menu": "showhide", "path": "Views/Video", "value": false } }
- Click button: { "fn": "executeMenuButton", "args": { "menu": "objects", "path": "Add Object" } }
- Set camera position: { "fn": "gotoLLA", "args": { "lat": 0, "lon": 0, "alt": 1000 } }

REMINDER: If the user asks you to DO something (set, change, move, show, hide, etc.), you MUST include the JSON block with the API call. No exceptions.

EOT;
}

// --- Build messages array from history ---
$messages = [["role" => "system", "content" => $systemPrompt]];
if (is_array($history)) {
    foreach ($history as $msg) {
        // Map 'user'/'bot' to OpenAI roles
        $role = $msg['role'] === 'bot' ? 'assistant' : $msg['role'];
        $messages[] = [
            "role" => $role,
            "content" => $msg['text']
        ];
    }
}

// Call OpenAI
$ch = curl_init("https://api.openai.com/v1/chat/completions");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer $OPENAI_API_KEY",
        "Content-Type: application/json"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "model" => "gpt-4o",
        "messages" => $messages,
        "temperature" => 0.2
    ])
]);

$response = curl_exec($ch);
curl_close($ch);

$parsed = json_decode($response, true);
$content = $parsed['choices'][0]['message']['content'] ?? '';

$text = '';
$calls = [];

// Extract JSON block if present and remove it from content
$calls = [];
if (preg_match('/```json\s*(\{.*?\})\s*```/s', $content, $matches)) {
    $json = json_decode($matches[1], true);
    if (isset($json['apiCalls'])) {
        $calls = $json['apiCalls'];
    }
    // Remove JSON block from content
    $content = preg_replace('/```json\s*\{.*?\}\s*```/s', '', $content);
}

$text = trim($content);

header('Content-Type: application/json');
echo json_encode([
    'text' => $text,
    'apiCalls' => $calls
]);
