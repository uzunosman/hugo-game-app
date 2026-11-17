#!/usr/bin/env bash
# VPS'te root olarak bir kez çalışır (tekrar çalıştırmak güvenli): Postgres container'ı, prod + staging veritabanları,
# hugo servisinin DATABASE_URL ayarı ve gece yedeği. Parolalar sunucuda üretilir, ekrana yazılmaz.
# Mac'ten: ssh root@31.97.38.250 'bash -s' < deploy/postgres-setup.sh
set -euo pipefail

CONF=/etc/hugo
DB_DIR=/opt/hugo-db
BACKUP_DIR=/var/backups/hugo
gen() { openssl rand -hex 24; }

install -d -m 750 -o root -g deploy "$CONF"
install -d -m 755 "$DB_DIR"
install -d -m 700 "$BACKUP_DIR"

# Süper kullanıcı parolası (yalnızca root okur)
[ -f "$CONF/postgres.env" ] || { echo "POSTGRES_PASSWORD=$(gen)" > "$CONF/postgres.env"; chmod 600 "$CONF/postgres.env"; }

# Container: yalnızca sunucunun içinden erişilir (127.0.0.1:5432), veri docker volume'unda
cat > "$DB_DIR/docker-compose.yml" <<'EOF'
name: hugo-db
services:
  hugo-db:
    image: postgres:17-alpine
    container_name: hugo-db
    restart: unless-stopped
    env_file: /etc/hugo/postgres.env
    ports:
      - 127.0.0.1:5432:5432
    volumes:
      - hugo-pgdata:/var/lib/postgresql/data
    shm_size: 128mb
volumes:
  hugo-pgdata:
EOF
docker compose -f "$DB_DIR/docker-compose.yml" up -d </dev/null
until docker exec hugo-db pg_isready -U postgres -q; do sleep 1; done

psql() { docker exec hugo-db psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

# Her ortam için ayrı rol ve veritabanı; rol yalnızca kendi veritabanına bağlanabilir
for ENVNAME in prod staging; do
    ROLE=hugo_$ENVNAME
    FILE=$CONF/hugo$([ "$ENVNAME" = prod ] || echo "-$ENVNAME").env
    if [ "$(psql -c "SELECT 1 FROM pg_roles WHERE rolname='$ROLE'")" != 1 ]; then
        PASS=$(gen)
        psql -c "CREATE ROLE $ROLE LOGIN PASSWORD '$PASS'"
        psql -c "CREATE DATABASE $ROLE OWNER $ROLE"
        psql -c "REVOKE CONNECT ON DATABASE $ROLE FROM PUBLIC"
        echo "DATABASE_URL=postgres://$ROLE:$PASS@127.0.0.1:5432/$ROLE" > "$FILE"
    fi
    chown root:deploy "$FILE"; chmod 640 "$FILE" # deploy kullanıcısı istatistik / bakım aracı için okuyabilir
done

# hugo servisi veritabanı adresini buradan alır (dosya yoksa eski dosya kaydıyla çalışır)
install -d /etc/systemd/system/hugo.service.d
printf '[Service]\nEnvironmentFile=-%s/hugo.env\n' "$CONF" > /etc/systemd/system/hugo.service.d/db.conf
systemctl daemon-reload

# Gece yedeği (03:30), 14 gün saklanır
cat > /etc/cron.d/hugo-db-backup <<EOF
30 3 * * * root docker exec hugo-db pg_dump -U postgres -Fc hugo_prod > $BACKUP_DIR/hugo_prod-\$(date +\%F).dump && find $BACKUP_DIR -name '*.dump' -mtime +14 -delete
EOF

echo "✔ Postgres hazır: hugo_prod, hugo_staging"
echo "  Servis bir sonraki deploy / yeniden başlatmada veritabanını kullanır."
