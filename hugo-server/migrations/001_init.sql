-- İlk şema: oyun durumu, oyuncular, arşivlenen masalar, oyun kaydı (event log)

-- Sunucunun bellekteki durumu (masalar, oyunlar, oyuncular): tek satır, her değişiklikte üzerine yazılır
-- shortcut: tek jsonb anlık görüntü (eski state.json); masa başına satıra ancak çok süreçli sunucu gerekirse geçilmeli
CREATE TABLE app_state (
    id         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    data       jsonb NOT NULL,
    saved_at   timestamptz NOT NULL DEFAULT now()
);

-- Gerçek oyuncular (botlar hariç); bellekten silinseler de burada kalır
CREATE TABLE players (
    id            text PRIMARY KEY,
    name          text NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- Kapatılan masaların özeti (eski archive.jsonl)
CREATE TABLE archived_rooms (
    id          text PRIMARY KEY,
    table_no    int,
    name        text,
    reason      text,
    archived_at timestamptz NOT NULL,
    data        jsonb NOT NULL
);
CREATE INDEX archived_rooms_table_no ON archived_rooms (table_no);

-- Oyun kaydı (eski events/YYYY-MM-DD.jsonl): type = ev alanı, data = satırın geri kalanı
CREATE TABLE events (
    id       bigserial PRIMARY KEY,
    at       timestamptz NOT NULL,
    type     text NOT NULL,
    table_no int,
    data     jsonb NOT NULL
);
CREATE INDEX events_at ON events (at);
CREATE INDEX events_table_no_at ON events (table_no, at) WHERE table_no IS NOT NULL;
