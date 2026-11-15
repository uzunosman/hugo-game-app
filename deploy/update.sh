#!/usr/bin/env bash
# Mac'ten çalışır, root gerekmez: kodu kopyalar, sunucuda derler, oyun sunucusunu yeniden başlatır.
# Kullanım: ./deploy/update.sh [ssh-adı]   (varsayılan: hugola → deploy@31.97.38.250, ~/.ssh/config)
set -euo pipefail
HOST=${1:-hugola}
cd "$(dirname "$0")/.."

rsync -az --delete \
    --exclude node_modules --exclude dist --exclude .git --exclude .env \
    --exclude 'hugo-server/data' --exclude .DS_Store \
    ./ "$HOST:/opt/hugo/"
# Sürüm: v1.<commit sayısı> (kısa hash); ekranın sağ altında görünür, test edilen sürüm buradan doğrulanır
VERSION="v1.$(git rev-list --count HEAD) $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- hugo-ui hugo-server || echo '+')"
echo "Sürüm: $VERSION"
ssh "$HOST" "export VITE_APP_VERSION='$VERSION'; bash -s" <<'REMOTE'
set -e
# Bağımlılıklar yalnızca package-lock değiştiyse yeniden kurulur: çalışan sunucunun node_modules klasörü silinmez
deps() { cd "/opt/hugo/$1"; sha256sum package-lock.json | cmp -s - node_modules/.lock-sum || { npm ci --no-audit --no-fund --loglevel=error && sha256sum package-lock.json > node_modules/.lock-sum; }; }
deps hugo-server && npm run build
deps hugo-ui && npm run build
sudo systemctl restart hugo
sleep 2
systemctl is-active --quiet hugo && echo "✔ Güncellendi" || { journalctl -u hugo -n 30 --no-pager; exit 1; }
REMOTE
