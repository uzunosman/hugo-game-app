import { useCallback, useEffect, useState } from 'react';

// Görevler (/admin/tasks): kanban panosu. İsteklerini madde madde yazarsın; Claude geliştirip "Teste hazır" yapar ve senaryo
// bağlar. "Test et" senaryoyu staging'de açar; sonucu karttan yazarsın: Onayla / Revize iste (not + ekran görüntüsü) / İptal.
// Durumu kart taşıyarak değil düğmelerle değiştirirsin (geliştirme durumlarını Claude değiştirir).

const STATUS = {
    new: { label: 'Yeni', tone: 'muted' },
    in_progress: { label: 'Geliştiriliyor', tone: 'info' },
    ready: { label: 'Teste hazır', tone: 'turn' },
    revision: { label: 'Revize', tone: 'danger' },
    approved: { label: 'Onaylandı', tone: 'ok' },
    done: { label: 'Canlıda', tone: 'ok' },
    cancelled: { label: 'İptal', tone: 'muted' },
};
const KIND = { note: 'not', revision: 'revize', approval: 'onay', cancel: 'iptal', status: 'durum' };
const when = (t) => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const StatusChip = ({ status }) => <span className={`yp-task-status tone-${STATUS[status]?.tone || 'muted'}`}>{STATUS[status]?.label || status}</span>;

// Ekran görüntüsü: en uzun kenar 1600 px, JPEG (sunucu sınırı 1,5 MB)
const shrink = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve({ name: file.name, dataUrl: c.toDataURL('image/jpeg', 0.82) });
    };
    img.onerror = () => reject(new Error('Resim okunamadı'));
    img.src = URL.createObjectURL(file);
});

function Attachment({ a, call }) {
    const [src, setSrc] = useState(null);
    useEffect(() => { call('admin:taskAttachment', { id: a.id }).then(r => r?.success && setSrc(r.dataUrl)); }, [a.id, call]);
    return src
        ? <a href={src} target="_blank" rel="noreferrer" className="yp-task-shot"><img src={src} alt={a.name || 'ekran görüntüsü'} /></a>
        : <span className="yp-task-shot is-loading">yükleniyor…</span>;
}

function TaskDetail({ id, call, stagingUrl, onChanged, onClose }) {
    const [data, setData] = useState(null);
    const [editing, setEditing] = useState(null); // { title, body } düzenlenirken
    const [text, setText] = useState('');
    const [images, setImages] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(() => call('admin:task', { id }).then(r => (r?.success ? setData(r) : setError(r?.error || 'Görev okunamadı'))), [call, id]);
    useEffect(() => { setData(null); setText(''); setImages([]); setError(''); setEditing(null); load(); }, [load]);

    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await call('admin:taskUpdate', { id, title: editing.title, body: editing.body });
        setBusy(false);
        if (!r?.success) return setError(r?.error || 'Kaydedilemedi');
        setEditing(null);
        load();
        onChanged();
    };

    const pick = async (e) => {
        const files = [...e.target.files].slice(0, 4 - images.length);
        e.target.value = '';
        try { setImages([...images, ...(await Promise.all(files.map(shrink)))]); } catch (err) { setError(err.message); }
    };
    const act = async (action) => {
        setBusy(true);
        setError('');
        const r = await call('admin:taskAction', { id, action, body: text, images });
        setBusy(false);
        if (!r?.success) return setError(r?.error || 'Kaydedilemedi');
        setData(r);
        setText('');
        setImages([]);
        onChanged();
    };

    if (!data) return <section className="yp-task-detail">{error ? <p className="yp-error">{error}</p> : <p className="yp-empty">Yükleniyor…</p>}</section>;
    const { task, notes, attachments } = data;
    const open = !['done', 'cancelled'].includes(task.status);
    return (
        <section className="yp-task-detail" aria-label={`Görev #${task.id}`}>
            <header>
                <h3>#{task.id} · {task.title}</h3>
                <StatusChip status={task.status} />
                {!editing && <button type="button" className="yp-btn is-quiet" onClick={() => setEditing({ title: task.title, body: task.body })}>Düzenle</button>}
                {onClose && <button type="button" className="yp-task-close" onClick={onClose} aria-label="Kapat">×</button>}
            </header>
            {editing ? (
                <form className="yp-task-edit" onSubmit={save}>
                    <input value={editing.title} maxLength={200} onChange={(e) => setEditing({ ...editing, title: e.target.value })} aria-label="Görev başlığı" />
                    <textarea value={editing.body} rows={6} maxLength={20000} onChange={(e) => setEditing({ ...editing, body: e.target.value })} aria-label="Görev açıklaması" placeholder={'Madde madde yaz:\n- …'} />
                    <div className="yp-task-actions">
                        <button type="submit" className="yp-btn" disabled={busy || !editing.title.trim()}>Kaydet</button>
                        <button type="button" className="yp-btn is-quiet" onClick={() => setEditing(null)}>Vazgeç</button>
                    </div>
                </form>
            ) : task.body ? <p className="yp-task-body">{task.body}</p> : <p className="yp-empty">Açıklama yok. Düzenle ile madde madde ekle.</p>}
            {(task.scenario_ids?.length > 0 || task.branch) && (
                <div className="yp-task-test">
                    {task.scenario_ids.map(s => (
                        <a key={s} className="yp-btn" href={`${stagingUrl}/?scenario=${encodeURIComponent(s)}`} target="_blank" rel="noreferrer">Test et: {s}</a>
                    ))}
                    {task.branch && <small>branch {task.branch}</small>}
                </div>
            )}
            <ol className="yp-task-notes">
                {notes.map(n => (
                    <li key={n.id} className={`by-${n.author} kind-${n.kind}`}>
                        <span className="yp-task-meta">{n.author === 'user' ? 'Sen' : 'Claude'} · {KIND[n.kind]} · {when(n.created_at)}</span>
                        {n.body && <span className="yp-task-text">{n.body}</span>}
                        {attachments.filter(a => a.note_id === n.id).map(a => <Attachment key={a.id} a={a} call={call} />)}
                    </li>
                ))}
                {!notes.length && <li className="yp-empty">Henüz not yok.</li>}
            </ol>
            <div className="yp-task-reply">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={20000}
                    placeholder={task.status === 'ready' ? 'Test sonucu: neyi denedin, ne olmalı?' : 'Not ekle'} aria-label="Not" />
                {images.length > 0 && (
                    <div className="yp-task-pending">
                        {images.map((im, i) => (
                            <button key={i} type="button" className="yp-task-shot" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label={`${im.name} resmini çıkar`}>
                                <img src={im.dataUrl} alt="" /><span aria-hidden="true">×</span>
                            </button>
                        ))}
                    </div>
                )}
                {error && <p className="yp-error" role="alert">{error}</p>}
                <div className="yp-task-actions">
                    {images.length < 4 && (
                        <label className="yp-btn is-quiet">Ekran görüntüsü ekle
                            <input type="file" accept="image/*" multiple onChange={pick} hidden />
                        </label>
                    )}
                    <button type="button" className="yp-btn is-quiet" disabled={busy || (!text.trim() && !images.length)} onClick={() => act('note')}>Not ekle</button>
                    {open && <button type="button" className="yp-btn is-danger" disabled={busy || (!text.trim() && !images.length)} onClick={() => act('revise')}>Revize iste</button>}
                    {open && <button type="button" className="yp-btn is-ok" disabled={busy} onClick={() => act('approve')}>Onayla</button>}
                    {open && <button type="button" className="yp-btn is-quiet" disabled={busy} onClick={() => act('cancel')}>İptal</button>}
                    {!open && <button type="button" className="yp-btn is-quiet" disabled={busy} onClick={() => act('reopen')}>Yeniden aç</button>}
                </div>
            </div>
        </section>
    );
}

// Pano sütunları (soldan sağa iş akışı); iptal edilenler isteğe bağlı
const COLUMNS = ['new', 'in_progress', 'ready', 'revision', 'approved', 'done'];
const DONE_SHOWN = 12; // canlıdakilerden son N

export default function Tasks({ call }) {
    const [tasks, setTasks] = useState(null);
    const [stagingUrl, setStagingUrl] = useState('');
    const [showCancelled, setShowCancelled] = useState(false);
    const [selected, setSelected] = useState(null);
    const [adding, setAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(() => call('admin:tasks', { all: true }).then(r => {
        if (!r?.success) return setError(r?.error || 'Görevler okunamadı');
        setTasks(r.tasks);
        setStagingUrl(r.stagingUrl);
    }), [call]);
    useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]); // Claude'un güncellemeleri
    useEffect(() => {
        if (!selected) return;
        const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selected]);

    const create = async (e) => {
        e.preventDefault();
        const r = await call('admin:taskCreate', { title, body });
        if (!r?.success) return setError(r?.error || 'Görev açılamadı');
        setTitle(''); setBody(''); setError(''); setAdding(false);
        setSelected(r.task.id);
        load();
    };

    const columns = [...COLUMNS, ...(showCancelled ? ['cancelled'] : [])];
    const byStatus = (st) => {
        const list = (tasks || []).filter(t => t.status === st);
        return st === 'done' ? list.slice(0, DONE_SHOWN) : list;
    };

    return (
        <section className="yp-section" aria-labelledby="yp-tasks">
            <div className="yp-section-head">
                <h2 id="yp-tasks">Görevler</h2>
                <small>istek → Claude geliştirir → staging'de test et → onayla / revize iste</small>
                <label className="yp-task-all"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> iptal edilenler</label>
            </div>
            {error && <p className="yp-error" role="alert">{error}</p>}
            <div className="yp-board">
                {columns.map(st => {
                    const list = byStatus(st);
                    return (
                        <section key={st} className={`yp-col st-${st}`} aria-label={`${STATUS[st].label} (${list.length})`}>
                            <header><StatusChip status={st} /><span>{(tasks || []).filter(t => t.status === st).length}</span></header>
                            {st === 'new' && (adding ? (
                                <form className="yp-task-new" onSubmit={create}>
                                    <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Başlık, örn. Sohbet kutusu küçülsün" aria-label="Görev başlığı" autoFocus />
                                    <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={20000}
                                        placeholder={'Madde madde yaz:\n- yazı boyu 11 px\n- kutu sağ altta'} aria-label="Görev açıklaması" />
                                    <div className="yp-task-actions">
                                        <button type="submit" className="yp-btn" disabled={!title.trim()}>Görev aç</button>
                                        <button type="button" className="yp-btn is-quiet" onClick={() => setAdding(false)}>Vazgeç</button>
                                    </div>
                                </form>
                            ) : <button type="button" className="yp-col-add" onClick={() => setAdding(true)}>+ Yeni görev</button>)}
                            <ul>
                                {list.map(t => (
                                    <li key={t.id}>
                                        <button type="button" className={`yp-card ${selected === t.id ? 'is-sel' : ''}`} aria-pressed={selected === t.id} onClick={() => setSelected(t.id)}>
                                            <span className="yp-task-title">#{t.id} {t.title}</span>
                                            <span className="yp-card-meta">
                                                {t.scenario_ids?.length > 0 && <span className="yp-card-tag">test: {t.scenario_ids.length}</span>}
                                                <small>{when(t.updated_at)} · {t.notes} not</small>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                                {tasks && !list.length && st !== 'new' && <li className="yp-col-empty">—</li>}
                            </ul>
                        </section>
                    );
                })}
            </div>
            {selected && (
                <div className="yp-drawer" role="dialog" aria-modal="true" aria-label={`Görev #${selected}`} onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
                    <TaskDetail id={selected} call={call} stagingUrl={stagingUrl} onChanged={load} onClose={() => setSelected(null)} />
                </div>
            )}
        </section>
    );
}
