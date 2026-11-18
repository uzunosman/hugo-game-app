// Profil: oyuncunun cihazdan cihaza taşınabilen kalıcı kimliği. Oyuncu (koltuk) kimliği masadan kalkınca değişir; profil
// değişmez. Arkadaşlıklar profiller arasındadır. Gizli anahtar yalnızca sahibinin cihazında durur (sunucuda özeti).
// Kayıt olunca (ileride) hesap bu profile bağlanır, arkadaşlar korunur.
// shortcut: profiller oyun durumu anlık görüntüsünde (app_state) tutulur; profil sayısı on binleri geçerse ayrı tabloya taşınmalı.
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface Profile {
    id: string;
    keyHash: string;
    name: string;
    avatar: string;
    createdAt: number;
    lastSeenAt: number;
    friends: string[];   // karşılıklı arkadaşlar (profil kimlikleri)
    requests: string[];  // bana gelen, cevap bekleyen istekler
}

const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

export class Profiles {
    map = new Map<string, Profile>();

    create(name: string, avatar = ''): { profile: Profile; key: string } {
        const key = crypto.randomBytes(24).toString('base64url');
        const profile: Profile = { id: uuidv4(), keyHash: hash(key), name, avatar, createdAt: Date.now(), lastSeenAt: Date.now(), friends: [], requests: [] };
        this.map.set(profile.id, profile);
        return { profile, key };
    }

    // Anahtar doğruysa profil (zamanlama saldırısına karşı sabit süreli karşılaştırma)
    verify(id: unknown, key: unknown): Profile | null {
        if (typeof id !== 'string' || typeof key !== 'string') return null;
        const p = this.map.get(id);
        if (!p) return null;
        const a = Buffer.from(p.keyHash), b = Buffer.from(hash(key));
        return a.length === b.length && crypto.timingSafeEqual(a, b) ? p : null;
    }

    get(id: string | undefined | null) { return id ? this.map.get(id) : undefined; }

    // İstek: karşı taraf da istemişse doğrudan arkadaş olunur
    request(fromId: string, toId: string): 'sent' | 'friends' | 'error' {
        const from = this.map.get(fromId), to = this.map.get(toId);
        if (!from || !to || from.id === to.id) return 'error';
        if (from.friends.includes(to.id)) return 'friends';
        if (from.requests.includes(to.id)) return this.respond(from.id, to.id, true) ? 'friends' : 'error';
        if (!to.requests.includes(from.id)) to.requests.push(from.id);
        return 'sent';
    }

    respond(meId: string, fromId: string, accept: boolean): boolean {
        const me = this.map.get(meId), from = this.map.get(fromId);
        if (!me || !me.requests.includes(fromId)) return false;
        me.requests = me.requests.filter(id => id !== fromId);
        if (accept && from) {
            if (!me.friends.includes(from.id)) me.friends.push(from.id);
            if (!from.friends.includes(me.id)) from.friends.push(me.id);
        }
        return true;
    }

    remove(meId: string, otherId: string) {
        const me = this.map.get(meId), other = this.map.get(otherId);
        if (me) me.friends = me.friends.filter(id => id !== otherId);
        if (other) other.friends = other.friends.filter(id => id !== meId);
    }

    toJSON() { return [...this.map.values()]; }
    restore(list: Profile[] = []) { this.map = new Map(list.map(p => [p.id, { ...p, friends: p.friends || [], requests: p.requests || [] }])); }
}
