-- Görevler (Faz 4): kullanıcının istekleri, Claude'un geliştirme / test hazırlığı, kullanıcının test sonucu
-- Durumlar: new (yeni) → in_progress (geliştiriliyor) → ready (teste hazır) → approved (onaylandı) → done (canlıda)
--           ready → revision (revize) → in_progress …; her durumdan cancelled (iptal)
CREATE TABLE tasks (
    id           serial PRIMARY KEY,
    title        text NOT NULL,
    body         text NOT NULL DEFAULT '',
    status       text NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'in_progress', 'ready', 'revision', 'approved', 'done', 'cancelled')),
    branch       text,
    scenario_ids text[] NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_status ON tasks (status);

-- Görev geçmişi: notlar, revize istekleri, onay / iptal, durum değişiklikleri (author: user | claude)
CREATE TABLE task_notes (
    id         serial PRIMARY KEY,
    task_id    int NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    author     text NOT NULL CHECK (author IN ('user', 'claude')),
    kind       text NOT NULL CHECK (kind IN ('note', 'revision', 'approval', 'cancel', 'status')),
    body       text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_notes_task ON task_notes (task_id, id);

-- Ekran görüntüleri (nota bağlı); boyut istemcide küçültülür, sunucuda sınırlanır
CREATE TABLE task_attachments (
    id         serial PRIMARY KEY,
    task_id    int NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    note_id    int REFERENCES task_notes (id) ON DELETE CASCADE,
    name       text NOT NULL DEFAULT '',
    mime       text NOT NULL,
    data       bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_attachments_task ON task_attachments (task_id);
