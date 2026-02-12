#!/bin/sh
set -e

Xvfb :99 -screen 0 1920x1080x24 &

exec "$@"