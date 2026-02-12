#!/bin/sh

# Replace placeholders in config.js with actual environment variable values
# If not set or empty, use empty string
JELLYFIN_SERVER_URL="${JELLYFIN_SERVER_URL:-}"
JELLYFIN_LOCAL_SERVER_URL="${JELLYFIN_LOCAL_SERVER_URL:-}"

# Create the runtime config by replacing the placeholders
sed -i "s|__JELLYFIN_SERVER_URL__|${JELLYFIN_SERVER_URL}|g" /usr/share/nginx/html/config.js
sed -i "s|__JELLYFIN_LOCAL_SERVER_URL__|${JELLYFIN_LOCAL_SERVER_URL}|g" /usr/share/nginx/html/config.js

# Start nginx
exec nginx -g 'daemon off;'
