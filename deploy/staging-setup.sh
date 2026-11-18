#!/usr/bin/env bash
# VPS'te root olarak bir kez çalışır (tekrar çalıştırmak güvenli): staging ortamı (test.hugola.io).
# Önce: deploy/postgres-setup.sh çalışmış, DNS'te test.hugola.io → 31.97.38.250 olmalı ve bu sürüm prod'a deploy edilmiş olmalı
# (docker-compose.yml ve Caddyfile.staging /opt/hugo/deploy/traefik'e gelir).
# Mac'ten: ssh root@31.97.38.250 'bash -s' < deploy/staging-setup.sh
set -euo pipefail

CONF=/etc/hugo
[ -f "$CONF/hugo-staging.env" ] || { echo "Önce deploy/postgres-setup.sh çalışmalı"; exit 1; }
[ -f /opt/hugo/deploy/traefik/Caddyfile.staging ] || { echo "Önce yeni sürüm prod'a deploy edilmeli (Caddyfile.staging yok)"; exit 1; }

# Kod klasörü: deploy kullanıcısı yazar (./deploy/update.sh --staging)
install -d -o deploy -g deploy /opt/hugo-staging /opt/hugo-staging/hugo-ui /opt/hugo-staging/hugo-ui/dist

# Giriş parolası: sunucuda üretilir, yalnızca bir kez gösterilir
if [ ! -f "$CONF/staging-auth.env" ]; then
    PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
    HASH=$(docker run --rm </dev/null caddy:2-alpine caddy hash-password --plaintext "$PASS" | base64 -w0)
    printf 'STAGING_USER=hugo\nSTAGING_HASH=%s\n' "$HASH" > "$CONF/staging-auth.env"
    chmod 600 "$CONF/staging-auth.env"
    echo "──────────────────────────────────────────────────────────"
    echo " test.hugola.io girişi → kullanıcı: hugo   parola: $PASS"
    echo " Bir kez gösterilir: parola yöneticine kaydet, kimseyle paylaşma."
    echo "──────────────────────────────────────────────────────────"
fi

cat > /etc/systemd/system/hugo-staging.service <<'EOF'
[Unit]
Description=Hugo oyun sunucusu (staging)
After=network.target docker.service

[Service]
User=hugo
WorkingDirectory=/opt/hugo-staging/hugo-server
Environment=NODE_ENV=production
Environment=APP_ENV=staging
Environment=PORT=3002
Environment=ORIGIN=https://test.hugola.io
Environment=CLIENT_URL=https://test.hugola.io
StateDirectory=hugo-staging
Environment=STATE_FILE=/var/lib/hugo-staging/state.json
EnvironmentFile=/etc/hugo/hugo-staging.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

# deploy kullanıcısı staging servisini yeniden başlatabilir
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart hugo-staging' > /etc/sudoers.d/hugo-staging
chmod 440 /etc/sudoers.d/hugo-staging
visudo -cf /etc/sudoers.d/hugo-staging >/dev/null

systemctl daemon-reload
systemctl enable hugo-staging >/dev/null # kod ilk staging deploy'unda gelir, servis o zaman başlar

# Web container'ı (Caddy, parola korumalı); prod container'ına dokunulmaz
cd /opt/hugo/deploy/traefik && docker compose up -d --force-recreate hugo-web-staging </dev/null # yeni parola da devreye girsin

echo "✔ Staging hazır. Sıradaki: Claude staging'e ilk deploy'u yapar."
