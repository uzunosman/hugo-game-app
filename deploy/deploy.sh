#!/usr/bin/env bash
# Mac'ten çalışır: kodu VPS'e kopyalar ve kurulumu/güncellemeyi yapar.
# Kullanım: ./deploy/deploy.sh root@SUNUCU_IP [alan-adı]   (alan adı ilk seferde verilir, sonra hatırlanır)
set -euo pipefail
HOST=${1:?Kullanım: ./deploy/deploy.sh root@SUNUCU_IP}
cd "$(dirname "$0")/.."

ssh "$HOST" 'command -v rsync >/dev/null || { apt-get update && apt-get install -y rsync; }; mkdir -p /opt/hugo'
rsync -az --delete \
    --exclude node_modules --exclude dist --exclude .git --exclude .env \
    --exclude 'hugo-server/data' --exclude .DS_Store \
    ./ "$HOST:/opt/hugo/"
ssh "$HOST" "DOMAIN=${2:-} PUBLIC_URL=http://${HOST#*@} bash /opt/hugo/deploy/setup.sh"
