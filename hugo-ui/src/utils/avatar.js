// Oyuncu avatarı: DiceBear (açık kaynak, MIT) ile yerelde üretilir; ağ isteği yok.
// İnsanlar için cinsiyet belirtmeyen "adventurer-neutral", yapay zekâ için robot ("bottts-neutral").
import { createAvatar } from '@dicebear/core';
import { adventurerNeutral, botttsNeutral } from '@dicebear/collection';

const cache = new Map();
const BG = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c7f0d8'];
// Oyuncunun seçtiği avatar tohumu (id → tohum); masa verisi geldikçe doldurulur
const chosen = new Map();

const render = (seed, isBot) => {
    const key = `${isBot ? 'b' : 'h'}:${seed}`;
    if (!cache.has(key)) {
        const style = isBot ? botttsNeutral : adventurerNeutral;
        cache.set(key, createAvatar(style, { seed: String(seed), radius: 50, backgroundColor: BG }).toDataUri());
    }
    return cache.get(key);
};

// Masadaki oyuncuların seçtiği avatarları hatırla: her ekran avatarı oyuncu kimliğiyle ister
export const rememberAvatars = (players = []) => {
    players.forEach(p => { if (p?.id && p.avatar) chosen.set(p.id, p.avatar); });
};

// Aynı oyuncu (id) her ekranda ve her elde aynı avatarı alır; seçtiği avatar varsa o
export const avatarFor = (id, isBot = false) => render(isBot ? id : (chosen.get(id) || id), isBot);

// Seçim penceresi için: tohumdan doğrudan avatar ve rastgele tohumlar
export const avatarFromSeed = (seed) => render(seed, false);
export const randomSeeds = (n) => Array.from({ length: n }, () => Math.random().toString(36).slice(2, 10));
