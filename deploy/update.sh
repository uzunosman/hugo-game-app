#!/usr/bin/env bash
# Mac'ten çalışır, root gerekmez: kodu kopyalar, sunucuda derler, oyun sunucusunu yeniden başlatır.
# Kullanım: ./deploy/update.sh [--staging] [ssh-adı]   (varsayılan: hugola → deploy@31.97.38.250, ~/.ssh/config)
# --staging: çalışma klasöründeki kod (o anki branch) test.hugola.io'ya kurulur; prod'a dokunulmaz
set -euo pipefail
APP=/opt/hugo SERVICE=hugo LABEL=''
if [ "${1:-}" = --staging ]; then
    shift
    APP=/opt/hugo-staging SERVICE=hugo-staging LABEL="staging $(git rev-parse --abbrev-ref HEAD) "
fi
HOST=${1:-hugola}
cd "$(dirname "$0")/.."

rsync -az --delete \
    --exclude node_modules --exclude dist --exclude .git --exclude .env \
    --exclude 'hugo-server/data' --exclude .DS_Store \
    ./ "$HOST:$APP/"
# Sürüm: v1.<commit sayısı> (kısa hash); ekranın sağ altında görünür, test edilen sürüm buradan doğrulanır
VERSION="${LABEL}v1.$(git rev-list --count HEAD) $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- hugo-ui hugo-server || echo '+')"
echo "Sürüm: $VERSION"
ssh "$HOST" "export VITE_APP_VERSION='$VERSION' APP='$APP' SERVICE='$SERVICE'; bash -s" <<'REMOTE'
set -e
# Bağımlılıklar yalnızca package-lock değiştiyse yeniden kurulur: çalışan sunucunun node_modules klasörü silinmez
deps() { cd "$APP/$1"; sha256sum package-lock.json | cmp -s - node_modules/.lock-sum || { npm ci --no-audit --no-fund --loglevel=error && sha256sum package-lock.json > node_modules/.lock-sum; }; }
deps hugo-server && npm run build
deps hugo-ui && npm run build
sudo systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" && echo "✔ Güncellendi ($SERVICE)" || { journalctl -u "$SERVICE" -n 30 --no-pager; exit 1; }
REMOTE
