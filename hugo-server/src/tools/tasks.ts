// Görevler aracı (Claude için): açık görevleri okur, durum ve not yazar. Veriler prod veritabanında.
// VPS'te: ssh hugola 'cd /opt/hugo/hugo-server && set -a && . /etc/hugo/hugo.env && node dist/tools/tasks.js <komut>'
//   list [--all]                         açık görevler (--all: kapananlar da)
//   show <id>                            görev, notlar, ekler
//   start <id> [not]                     geliştiriliyor
//   ready <id> --scenario a,b [--branch x] [not]   teste hazır (senaryolar staging'de "Test et" ile açılır)
//   done <id> [not]                      canlıda
//   note <id> <not>                      Claude notu (durum değişmez)
//   attachments <id> <klasör>            ekran görüntülerini klasöre yazar
import fs from 'fs';
import path from 'path';
import { addNote, getAttachment, getTask, listTasks, TaskStatus } from '../tasks/tasks';
import { pool } from '../db/db';

const STATUS_TR: Record<string, string> = {
    new: 'Yeni', in_progress: 'Geliştiriliyor', ready: 'Teste hazır', revision: 'Revize', approved: 'Onaylandı', done: 'Canlıda', cancelled: 'İptal',
};
const KIND_TR: Record<string, string> = { note: 'not', revision: 'REVİZE', approval: 'ONAY', cancel: 'İPTAL', status: 'durum' };
const day = (t: Date) => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

const flag = (args: string[], name: string) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
};

const run = async (argv: string[]) => {
    const [cmd, ...args] = argv;
    const id = Number(args[0]);
    const rest = () => args.slice(1).join(' ');
    const setStatus = (status: TaskStatus, extra = {}) => addNote(id, 'claude', 'status', rest(), status, [], extra);
    switch (cmd) {
        case 'list':
        case undefined: {
            const tasks = await listTasks(args.includes('--all'));
            if (!tasks.length) return console.log('Açık görev yok');
            for (const t of tasks) console.log(`#${t.id}  [${STATUS_TR[t.status]}]  ${t.title}  (${t.notes} not, ${day(t.updated_at)})`);
            return;
        }
        case 'show': {
            const { task, notes, attachments } = await getTask(id);
            console.log(`#${task.id} ${task.title}\nDurum: ${STATUS_TR[task.status]}${task.branch ? ` · branch ${task.branch}` : ''}${task.scenario_ids.length ? ` · senaryo ${task.scenario_ids.join(', ')}` : ''}`);
            console.log(`Oluşturma: ${day(task.created_at)} · güncelleme: ${day(task.updated_at)}\n\n${task.body || '(açıklama yok)'}\n`);
            for (const n of notes) {
                const files = attachments.filter(a => a.note_id === n.id).map(a => `ek #${a.id} ${a.name || a.mime} (${Math.round(a.size / 1024)} KB)`);
                console.log(`— ${day(n.created_at)} ${n.author === 'user' ? 'Kullanıcı' : 'Claude'} [${KIND_TR[n.kind]}] ${n.body}${files.length ? `\n    ${files.join(', ')}` : ''}`);
            }
            return;
        }
        case 'start': await setStatus('in_progress'); return console.log(`#${id} → Geliştiriliyor`);
        case 'done': await setStatus('done'); return console.log(`#${id} → Canlıda`);
        case 'ready': {
            const scenarios = flag(args, '--scenario');
            const branch = flag(args, '--branch');
            await setStatus('ready', { scenarioIds: scenarios ? scenarios.split(',').map(s => s.trim()).filter(Boolean) : undefined, branch });
            return console.log(`#${id} → Teste hazır${scenarios ? ` (senaryo: ${scenarios})` : ''}`);
        }
        case 'note': await addNote(id, 'claude', 'note', rest()); return console.log(`#${id} not eklendi`);
        case 'attachments': {
            const dir = args[1];
            if (!dir) throw new Error('Klasör gerekli');
            fs.mkdirSync(dir, { recursive: true });
            const { attachments } = await getTask(id);
            for (const a of attachments) {
                const { mime, data } = await getAttachment(a.id);
                const file = path.join(dir, `task${id}-ek${a.id}.${mime.split('/')[1].replace('jpeg', 'jpg')}`);
                fs.writeFileSync(file, data);
                console.log(file);
            }
            return;
        }
        default: throw new Error(`Bilinmeyen komut: ${cmd}`);
    }
};

if (require.main === module) {
    run(process.argv.slice(2))
        .catch(error => { console.error((error as Error).message); process.exitCode = 1; })
        .finally(() => pool?.end());
}
