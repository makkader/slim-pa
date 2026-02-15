#!/bin/sh
set -e

Xvfb :99 -screen 0 1920x1080x24 &

# Run npm install in all extension directories with package.json
if [ -d "/app/.pi/extensions" ]; then
    find /app/.pi/extensions -type f -name "package.json" -exec dirname {} \; | while read -r dir; do
        echo "Installing npm dependencies in: $dir"
        (cd "$dir" && npm install)
    done
fi

exec "$@"
