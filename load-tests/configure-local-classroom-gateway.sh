#!/usr/bin/env bash
set -euo pipefail
# Dedicated disposable local container only. Hosted production is not touched.
# A proxied request uses frontend/upstream slots; each student sends three retries.
docker exec \
  -e KONG_NGINX_EVENTS_WORKER_CONNECTIONS=8192 \
  -e KONG_NGINX_MAIN_WORKER_RLIMIT_NOFILE=16384 \
  supabase_kong_brains-classroom-local kong reload -p /usr/local/kong
docker exec supabase_kong_brains-classroom-local sh -c \
  'grep -E "worker_connections 8192;|worker_rlimit_nofile 16384;" /usr/local/kong/nginx.conf'
