// Yönetim ekranı (hugola.io/yonetim) için veri: anahtar, günlük kayıt okuma, masa izleme, son sorunlar.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { stateFile } from './Persistence';
import { eventsDir, dayOf, recentTableEvents } from './EventLog';
import { dailyStats } from '../tools/stats';

// Anahtar: ADMIN_TOKEN ortam değişkeni; yoksa ilk açılışta üretilip durum dosyasının yanına (admin-token) yazılır
let token: string | null = null;
export const adminToken = (): string => {
    if (token) return token;
    if (process.env.ADMIN_TOKEN) return (token = process.env.ADMIN_TOKEN);
    const file = path.join(path.dirname(stateFile()), 'admin-token');
    try { token = fs.readFileSync(file, 'utf8').trim(); } catch { /* yok: üretilir */ }
    if (!token) {
        token = crypto.randomBytes(18).toString('base64url');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, token + '\n', { mode: 0o600 });
        console.log(`Yönetim anahtarı oluşturuldu: ${file}`);
    }
    return token;
};
export const checkToken = (given: unknown): boolean => {
    const a = Buffer.from(String(given ?? ''));
    const b = Buffer.from(adminToken());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

type Ev = Record<string, any>;
const fileOf = (day: string) => path.join(eventsDir(), `${day}.jsonl`);

// Gün dosyası okunup ayrıştırılır; dosya değişmediyse ya da 20 sn içinde okunduysa önbellekten
// shortcut: dosya tümüyle belleğe okunur (günde ~80 MB'a kadar sorun değil); çok büyürse akışla (readline) okunmalı
const cache = new Map<string, { size: number; at: number; events: Ev[] }>();
export const readDay = (day: string): Ev[] => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
    let size = 0;
    try { size = fs.statSync(fileOf(day)).size; } catch { return []; }
    const hit = cache.get(day);
    if (hit && (hit.size === size || Date.now() - hit.at < 20_000)) return hit.events;
    const events = fs.readFileSync(fileOf(day), 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
    if (cache.size > 7) cache.delete(cache.keys().next().value!);
    cache.set(day, { size, at: Date.now(), events });
    return events;
};

export const days = (): string[] => {
    try { return fs.readdirSync(eventsDir()).filter(f => f.endsWith('.jsonl')).map(f => f.slice(0, 10)).sort().reverse(); } catch { return []; }
};

export const statsOf = (day = dayOf()) => dailyStats(readDay(day));

// Bir masanın son olayları (izleme): yeni → eski
// Bugün için bellekteki son olaylar (anında), yoksa / geçmiş gün için dosya
// (sunucu yeniden başladıysa bellekteki liste kısadır: öncesi dosyadan tamamlanır)
export const tableEvents = (no: number, day = dayOf(), limit = 400) => {
    const mem = day === dayOf() ? recentTableEvents(no) || [] : [];
    const older = mem.length >= limit ? [] : readDay(day).filter(e => e.masa === no && (!mem.length || e.t < (mem[0] as Ev).t));
    return [...older, ...mem].slice(-limit).reverse();
};

// Son sorunlar: reddedilen istekler ve istemci hata / donma kayıtları
export const problems = (day = dayOf(), limit = 60) =>
    readDay(day).filter(e => (e.ev === 'istek' && e.ok === false) || e.ev === 'istemci').slice(-limit).reverse();
