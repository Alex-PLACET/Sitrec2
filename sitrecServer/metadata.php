<?php
/**
 * User Metadata API
 *
 * Handles loading and saving user metadata (label definitions + sitch-label mappings).
 * Storage mirrors settings.php pattern:
 *   - S3: metadata/<userID>.json
 *   - Local: $UPLOAD_PATH/metadata/<userID>.json
 *
 * Per-sitch metadata is also written to <userID>/<sitchName>/metadata.json
 * when labels are assigned.
 *
 * GET: Returns user metadata {labels: [...], sitchLabels: {...}}
 * POST: Saves user metadata. If "updateSitches" array is provided, also writes per-sitch metadata.json for each.
 */

header('Content-Type: application/json');

// CORS support (matches getsitches.php pattern) — needed because the client
// calls this endpoint via the absolute SITREC_SERVER URL which may be cross-origin
// during development (webpack dev server on a different port).
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin) {
    $serverOrigin = $_SERVER['REQUEST_SCHEME'] . '://' . $_SERVER['HTTP_HOST'];
    $allowedOrigins = [$serverOrigin];
    $localhostEnv = getenv('LOCALHOST');
    if ($localhostEnv) {
        $allowedOrigins[] = 'https://' . $localhostEnv;
        $allowedOrigins[] = 'http://'  . $localhostEnv;
    }
    if (in_array($requestOrigin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $requestOrigin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require('./user.php');

$user_id = getUserID();

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/config_paths.php';

// Allow unauthenticated GET for featured data only; everything else requires login
if ($user_id == 0 && !($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['featured']))) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit();
}

define('MAX_LABELS', 100);
define('MAX_LABEL_NAME_LENGTH', 50);
define('MAX_SITCHES_WITH_LABELS', 10000);
define('SITCH_NAME_PATTERN', '/^(?!\.{1,2}$)[^\/\\\\<>\x00-\x1f]+$/u');

function isValidSitchName($name) {
    return is_string($name) && preg_match(SITCH_NAME_PATTERN, $name) === 1;
}

/**
 * Sanitize user metadata to prevent exploits.
 */
function sanitizeMetadata($data) {
    $sanitized = ['labels' => [], 'sitchLabels' => []];

    // Sanitize label definitions
    if (isset($data['labels']) && is_array($data['labels'])) {
        $count = 0;
        foreach ($data['labels'] as $label) {
            if ($count >= MAX_LABELS) break;
            if (!is_array($label) || !isset($label['name'])) continue;

            $name = substr(trim(strval($label['name'])), 0, MAX_LABEL_NAME_LENGTH);
            if ($name === '') continue;

            // Validate color (hex format)
            $color = '#4285f4'; // default blue
            if (isset($label['color']) && preg_match('/^#[0-9a-fA-F]{6}$/', $label['color'])) {
                $color = $label['color'];
            }

            $sanitized['labels'][] = ['name' => $name, 'color' => $color];
            $count++;
        }
    }

    // Sanitize sitch-label mappings
    if (isset($data['sitchLabels']) && is_array($data['sitchLabels'])) {
        $count = 0;
        foreach ($data['sitchLabels'] as $sitchName => $labels) {
            if ($count >= MAX_SITCHES_WITH_LABELS) break;
            if (!is_string($sitchName) || !is_array($labels)) continue;

            // Normalize then validate to block traversal-like names (e.g. "."/"..")
            $sitchName = basename($sitchName);
            if (!isValidSitchName($sitchName)) continue;

            $cleanLabels = [];
            foreach ($labels as $lbl) {
                $lbl = substr(trim(strval($lbl)), 0, MAX_LABEL_NAME_LENGTH);
                if ($lbl !== '') $cleanLabels[] = $lbl;
            }
            if (!empty($cleanLabels)) {
                $sanitized['sitchLabels'][$sitchName] = $cleanLabels;
            }
            $count++;
        }
    }

    // Preserve screenshotVersions (integer counters per sitch)
    if (isset($data['screenshotVersions']) && is_array($data['screenshotVersions'])) {
        foreach ($data['screenshotVersions'] as $sitchName => $ver) {
            if (!is_string($sitchName) || !isValidSitchName(basename($sitchName))) continue;
            $sanitized['screenshotVersions'][basename($sitchName)] = intval($ver);
        }
    }

    // Force sitchLabels to encode as JSON object {} not array []
    if (empty($sanitized['sitchLabels'])) {
        $sanitized['sitchLabels'] = new \stdClass();
    }
    if (empty($sanitized['screenshotVersions'])) {
        $sanitized['screenshotVersions'] = new \stdClass();
    }

    return $sanitized;
}

// --- S3 helpers (same pattern as settings.php) ---

function startS3() {
    require 'vendor/autoload.php';
    global $s3creds;
    if (!isset($s3creds) || !is_array($s3creds) || empty($s3creds['accessKeyId']) || $s3creds['accessKeyId'] === 0) {
        http_response_code(503);
        echo json_encode(['error' => 'S3 credentials not configured']);
        exit();
    }
    $aws = $s3creds;
    $credentials = new Aws\Credentials\Credentials($aws['accessKeyId'], $aws['secretAccessKey']);
    $s3 = new Aws\S3\S3Client([
        'version' => 'latest',
        'region' => $aws['region'],
        'credentials' => $credentials
    ]);
    return ['s3' => $s3, 'aws' => $aws];
}

function readS3Json($s3, $aws, $key) {
    try {
        $result = $s3->getObject(['Bucket' => $aws['bucket'], 'Key' => $key]);
        $data = json_decode($result['Body']->getContents(), true);
        return is_array($data) ? $data : [];
    } catch (Aws\S3\Exception\S3Exception $e) {
        if ($e->getAwsErrorCode() === 'NoSuchKey') return [];
        throw $e;
    }
}

function writeS3Json($s3, $aws, $key, $data) {
    $s3->putObject([
        'Bucket' => $aws['bucket'],
        'Key' => $key,
        'Body' => json_encode($data, JSON_PRETTY_PRINT),
        'ContentType' => 'application/json',
        'ACL' => 'private'
    ]);
}

// --- Local filesystem helpers ---

function readLocalJson($path) {
    if (!is_file($path)) return [];
    $data = json_decode(file_get_contents($path), true);
    return is_array($data) ? $data : [];
}

function writeLocalJson($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));
}

// ============================
// Handle GET - Fetch metadata
// ============================
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // GET ?featured=1 — return global featured.json (no auth required beyond login)
    // Returns [{name, userID, screenshotUrl}] so any user can browse and load featured sitches.
    if (isset($_GET['featured'])) {
        try {
            global $useAWS, $UPLOAD_PATH, $UPLOAD_URL;
            if ($useAWS) {
                $s3Data = startS3();
                $raw = readS3Json($s3Data['s3'], $s3Data['aws'], 'metadata/featured.json');
            } else {
                $raw = readLocalJson($UPLOAD_PATH . 'metadata/featured.json');
            }
            $sitches = [];
            if (isset($raw['sitches']) && is_array($raw['sitches'])) {
                foreach ($raw['sitches'] as $entry) {
                    if (!is_array($entry) || !isset($entry['name']) || !isset($entry['userID'])) continue;
                    $name = basename(strval($entry['name']));
                    $uid = intval($entry['userID']);
                    if ($uid <= 0 || !isValidSitchName($name)) continue;

                    $screenshotUrl = null;
                    if ($useAWS) {
                        // Construct S3 screenshot URL
                        $ssKey = $uid . '/' . $name . '/screenshot.jpg';
                        try {
                            $s3Data['s3']->headObject(['Bucket' => $s3Data['aws']['bucket'], 'Key' => $ssKey]);
                            $screenshotUrl = $s3Data['s3']->getObjectUrl($s3Data['aws']['bucket'], $ssKey);
                        } catch (Exception $e) { /* no screenshot */ }
                    } else {
                        $ssPath = $UPLOAD_PATH . $uid . '/' . $name . '/screenshot.jpg';
                        if (is_file($ssPath)) {
                            $screenshotUrl = $UPLOAD_URL . $uid . '/' . $name . '/screenshot.jpg';
                        }
                    }

                    $sitches[] = ['name' => $name, 'userID' => $uid, 'screenshotUrl' => $screenshotUrl];
                }
            }
            echo json_encode(['sitches' => $sitches]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
        }
        exit();
    }

    try {
        global $useAWS;
        if ($useAWS) {
            $s3Data = startS3();
            $key = 'metadata/' . $user_id . '.json';
            $raw = readS3Json($s3Data['s3'], $s3Data['aws'], $key);
        } else {
            global $UPLOAD_PATH;
            $path = $UPLOAD_PATH . 'metadata/' . $user_id . '.json';
            $raw = readLocalJson($path);
        }
        $sanitized = sanitizeMetadata($raw);
        echo json_encode($sanitized);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
    }
    exit();
}

// ============================
// Handle POST - Save metadata
// ============================
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON']);
            exit();
        }

        // Handle screenshotVersion bump: read-modify-write
        if (isset($input['bumpScreenshotVersions']) && is_array($input['bumpScreenshotVersions'])) {
            global $useAWS;
            $metaKey = $useAWS ? ('metadata/' . $user_id . '.json') : null;
            $metaPath = $useAWS ? null : ($GLOBALS['UPLOAD_PATH'] . 'metadata/' . $user_id . '.json');

            // Read existing
            if ($useAWS) {
                $s3Data = startS3();
                $existing = readS3Json($s3Data['s3'], $s3Data['aws'], $metaKey);
            } else {
                $existing = readLocalJson($metaPath);
            }
            $existing = sanitizeMetadata($existing);

            // Bump versions
            $versions = (array)($existing['screenshotVersions'] ?? []);
            foreach ($input['bumpScreenshotVersions'] as $rawName) {
                if (!is_string($rawName)) continue;
                $sitchName = basename($rawName);
                if (!isValidSitchName($sitchName)) continue;
                $versions[$sitchName] = ($versions[$sitchName] ?? 0) + 1;
            }
            $existing['screenshotVersions'] = empty($versions) ? new \stdClass() : $versions;

            // Write back
            if ($useAWS) {
                writeS3Json($s3Data['s3'], $s3Data['aws'], $metaKey, $existing);
            } else {
                writeLocalJson($metaPath, $existing);
            }

            echo json_encode(['success' => true, 'screenshotVersions' => $existing['screenshotVersions']]);
            exit();
        }

        // Handle updateFeatured: admin-only, writes global metadata/featured.json
        // Each featured entry stores {name, userID} so any user can load them.
        if (isset($input['updateFeatured']) && $input['updateFeatured']) {
            if (!isAdmin()) {
                http_response_code(403);
                echo json_encode(['error' => 'Admin access required']);
                exit();
            }

            $sitches = [];
            if (isset($input['sitches']) && is_array($input['sitches'])) {
                foreach ($input['sitches'] as $entry) {
                    if (is_array($entry) && isset($entry['name']) && isset($entry['userID'])) {
                        $name = basename(strval($entry['name']));
                        $uid = intval($entry['userID']);
                        if ($uid > 0 && isValidSitchName($name)) {
                            $sitches[] = ['name' => $name, 'userID' => $uid];
                        }
                    }
                }
            }
            $featuredData = ['sitches' => $sitches];

            global $useAWS;
            if ($useAWS) {
                $s3Data = startS3();
                writeS3Json($s3Data['s3'], $s3Data['aws'], 'metadata/featured.json', $featuredData);
            } else {
                global $UPLOAD_PATH;
                writeLocalJson($UPLOAD_PATH . 'metadata/featured.json', $featuredData);
            }

            echo json_encode(['success' => true, 'featured' => $featuredData]);
            exit();
        }

        $sanitized = sanitizeMetadata($input);

        global $useAWS;
        if ($useAWS) {
            $s3Data = startS3();
            $s3 = $s3Data['s3'];
            $aws = $s3Data['aws'];

            // Save user-level metadata
            writeS3Json($s3, $aws, 'metadata/' . $user_id . '.json', $sanitized);

            // Write per-sitch metadata.json for each listed sitch
            if (isset($input['updateSitches']) && is_array($input['updateSitches'])) {
                foreach ($input['updateSitches'] as $rawName) {
                    if (!is_string($rawName)) continue;
                    $sitchName = basename($rawName);
                    if (!isValidSitchName($sitchName)) continue;
                    $sitchLabels = $sanitized['sitchLabels'][$sitchName] ?? [];
                    $sitchKey = $user_id . '/' . $sitchName . '/metadata.json';
                    writeS3Json($s3, $aws, $sitchKey, ['labels' => $sitchLabels]);
                }
            }
        } else {
            global $UPLOAD_PATH;

            // Save user-level metadata
            $metaPath = $UPLOAD_PATH . 'metadata/' . $user_id . '.json';
            writeLocalJson($metaPath, $sanitized);

            // Write per-sitch metadata.json for each listed sitch
            if (isset($input['updateSitches']) && is_array($input['updateSitches'])) {
                foreach ($input['updateSitches'] as $rawName) {
                    if (!is_string($rawName)) continue;
                    $sitchName = basename($rawName);
                    if (!isValidSitchName($sitchName)) continue;
                    $sitchLabels = $sanitized['sitchLabels'][$sitchName] ?? [];
                    $sitchPath = $UPLOAD_PATH . $user_id . '/' . $sitchName . '/metadata.json';
                    writeLocalJson($sitchPath, ['labels' => $sitchLabels]);
                }
            }
        }

        echo json_encode(['success' => true, 'metadata' => $sanitized]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
    }
    exit();
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
