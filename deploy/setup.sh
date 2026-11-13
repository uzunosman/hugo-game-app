#!/usr/bin/env bash
# Sunucuda (Ubuntu 24.04, root) çalışır: gerekenleri kurar, derler, servisi (yeniden) başlatır.
# Tekrar tekrar çalıştırılabilir; güncellemede de aynı betik kullanılır.
set -euo pipefail
APP=/opt/hugo
export DEBIAN_FRONTEND=noninteractive

# Node 22 ve Caddy (yalnızca ilk kurulumda)
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    apt-get update
    apt-get install -y curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
command -v caddy >/dev/null || { apt-get update; apt-get install -y caddy; }
id hugo >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin hugo

# Derleme
cd "$APP/hugo-server" && npm ci --no-audit --no-fund && npm run build
cd "$APP/hugo-ui" && npm ci --no-audit --no-fund && npm run build

# Alan adı bir kez verilir ve hatırlanır (DOMAIN=hugola.io); yoksa IP üzerinden düz http
DOMAIN=${DOMAIN:-$(cat /etc/hugo-domain 2>/dev/null || true)}
if [ -n "$DOMAIN" ]; then
    echo "$DOMAIN" > /etc/hugo-domain
    PUBLIC_URL=https://$DOMAIN
    SITE=$DOMAIN
else
    PUBLIC_URL=${PUBLIC_URL:-http://$(hostname -I | awk '{print $1}')}
    SITE=:80
fi

cat > /etc/systemd/system/hugo.service <<EOF
[Unit]
Description=Hugo oyun sunucusu
After=network.target

[Service]
User=hugo
WorkingDirectory=$APP/hugo-server
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=ORIGIN=$PUBLIC_URL
Environment=CLIENT_URL=$PUBLIC_URL
# Oyun durumu kod klasörünün dışında: güncellemeler masaları silmez
StateDirectory=hugo
Environment=STATE_FILE=/var/lib/hugo/state.json
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

# Caddy: arayüzü yayınlar, /socket.io isteklerini Node'a iletir; alan adında HTTPS sertifikasını kendisi alır
cat > /etc/caddy/Caddyfile <<EOF
$SITE {
    encode gzip
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:3001
    }
    handle {
        root * $APP/hugo-ui/dist
        try_files {path} /index.html
        file_server
    }
}
EOF
if [ -n "$DOMAIN" ]; then
    printf 'www.%s {\n    redir https://%s{uri} permanent\n}\n' "$DOMAIN" "$DOMAIN" >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

systemctl daemon-reload
systemctl enable hugo >/dev/null
systemctl restart hugo
# 80/443'ü Traefik tutuyorsa (Hostinger Docker şablonu) Caddy kapalı kalır, Hugo Traefik'in arkasına girer
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q traefik; then
    systemctl disable --now caddy 2>/dev/null || true
    (cd "$APP/deploy/traefik" && docker compose up -d)
else
    systemctl enable caddy >/dev/null
    systemctl reload caddy 2>/dev/null || systemctl restart caddy
fi

sleep 2
systemctl is-active --quiet hugo && echo "✔ Hugo çalışıyor: $PUBLIC_URL" || { journalctl -u hugo -n 30 --no-pager; exit 1; }
