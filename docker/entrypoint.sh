#!/bin/bash
# Sitrec Docker entrypoint
# Converts Docker environment variables into runtime configuration for both
# PHP (shared.env.php) and JavaScript (window.__SITREC_ENV__ in index.html).

set -e

HTML_FILE="/var/www/html/index.html"
ENV_PHP_FILE="/var/www/html/shared.env.php"

# ---------------------------------------------------------------------------
# List of environment variable names that Sitrec understands.
# The entrypoint only forwards variables that are explicitly listed here,
# so random container env vars (PATH, HOSTNAME, …) don't leak in.
# ---------------------------------------------------------------------------
KNOWN_VARS="
NO_TERRAIN
LOCAL_DOCS
LOCALHOST
BANNER_ACTIVE
BANNER_TOP_TEXT
BANNER_BOTTOM_TEXT
BANNER_COLOR
BANNER_BACKGROUND_COLOR
BANNER_HEIGHT
BANNER_TEXT_HEIGHT
BANNER_FONT
VERSION
DEFAULT_MAP_TYPE
DOCKER_MAP_TYPE
DEFAULT_ELEVATION_TYPE
DOCKER_ELEVATION_TYPE
XENFORO_PATH
SITREC_FORUM_ORIGIN
SAVE_TO_SERVER
SAVE_TO_S3
USE_S3_PRESIGNED_URLS
S3_MULTIPART_THRESHOLD_MB
S3_CHUNK_SIZE_MB
S3_PARALLEL_UPLOADS
S3_PRESIGNED_GET_EXPIRY_SECONDS
S3_PRESIGNED_PUT_EXPIRY_SECONDS
S3_PRESIGNED_MULTIPART_EXPIRY_SECONDS
S3_DEFAULT_VISIBILITY
S3_PRIVATE_PREFIXES
S3_PUBLIC_PREFIXES
S3_PUBLIC_BASE_URL
S3_PUBLIC_OBJECT_ACL
S3_PRIVATE_OBJECT_ACL
SAVE_TO_LOCAL
MAX_FILE_SIZE_MB
CHATBOT_ENABLED
CHATBOT_PROVIDER
DEFAULT_PLATFORM_MODEL
SETTINGS_COOKIES_ENABLED
SETTINGS_SERVER_ENABLED
SETTINGS_DB_ENABLED
SITREC_USE_CUSTOM_TLE
SITREC_CUSTOM_TLE_MENU_NAME
SITREC_CUSTOM_TLE_TOOLTIP
SITREC_ENABLE_DEFAULT_TLE_SOURCES
CUSTOM_TLE
CACHE_CUSTOM_TLE
CURRENT_STARLINK
CURRENT_ACTIVE
TLE_ZIP_ENABLED
SITREC_TRACK_STATS
SITREC_DISABLE_SSL_VERIFY
MAPBOX_TOKEN
MAPTILER_KEY
CESIUM_ION_TOKEN
GOOGLE_MAPS_API_KEY
SPACEDATA_USERNAME
SPACEDATA_PASSWORD
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_REGION
S3_BUCKET
S3_ACL
OPENAI_API
ANTHROPIC_API
GROQ_API
GROK_API
"

# ---------------------------------------------------------------------------
# 1. Generate shared.env.php from environment variables
#    PHP's injectEnv.php reads this file via putenv().
#    We wrap it in a PHP comment so it can't be served as plain text.
# ---------------------------------------------------------------------------
echo "<?php /*;" > "$ENV_PHP_FILE"

for var in $KNOWN_VARS; do
    val="${!var}"
    if [ -n "$val" ]; then
        echo "${var}=${val}" >> "$ENV_PHP_FILE"
    fi
done

echo "*/" >> "$ENV_PHP_FILE"

echo "[entrypoint] Wrote $ENV_PHP_FILE"

# ---------------------------------------------------------------------------
# 2. Inject window.__SITREC_ENV__ into index.html
#    The frontend's getEnv() helper reads this object, falling back to
#    the build-time process.env values baked in by dotenv-webpack.
# ---------------------------------------------------------------------------
if [ -f "$HTML_FILE" ]; then
    # Build a JSON object from set env vars
    JSON="{"
    FIRST=true
    for var in $KNOWN_VARS; do
        val="${!var}"
        if [ -n "$val" ]; then
            # Escape double quotes and backslashes in the value
            escaped=$(echo "$val" | sed 's/\\/\\\\/g; s/"/\\"/g')
            if [ "$FIRST" = true ]; then
                FIRST=false
            else
                JSON+=","
            fi
            JSON+="\"${var}\":\"${escaped}\""
        fi
    done
    JSON+="}"

    # Inject a <script> tag right after <head> in index.html
    SCRIPT_TAG="<script>window.__SITREC_ENV__=${JSON};<\/script>"

    # Use sed to insert after the opening <head> tag
    # The built index.html has <head> on a single line
    sed -i "s|<head>|<head>${SCRIPT_TAG}|" "$HTML_FILE"

    echo "[entrypoint] Injected runtime env into $HTML_FILE"
else
    echo "[entrypoint] WARNING: $HTML_FILE not found, skipping JS env injection"
fi

# ---------------------------------------------------------------------------
# 3. Hand off to the default Apache entrypoint
# ---------------------------------------------------------------------------
exec docker-php-entrypoint "$@"
