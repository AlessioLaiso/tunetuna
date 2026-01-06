#!/bin/sh

# Replace placeholder in config.js with actual environment variable value
# If JELLYFIN_SERVER_URL is not set or empty, use empty string
JELLYFIN_SERVER_URL="${JELLYFIN_SERVER_URL:-}"

# Create the runtime config by replacing the placeholder
sed -i "s|__JELLYFIN_SERVER_URL__|${JELLYFIN_SERVER_URL}|g" /usr/share/nginx/html/config.js

# Start nginx
exec nginx -g 'daemon off;'
