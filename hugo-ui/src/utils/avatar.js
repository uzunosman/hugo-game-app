// Oyuncu avatarı: DiceBear (açık kaynak, MIT) ile yerelde üretilir; ağ isteği yok.
// İnsanlar için cinsiyet belirtmeyen "adventurer-neutral", yapay zekâ için robot ("bottts-neutral").
import { createAvatar } from '@dicebear/core';
import { adventurerNeutral, botttsNeutral } from '@dicebear/collection';

const cache = new Map();
const BG = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c7f0d8'];

// Aynı oyuncu (id) her ekranda ve her elde aynı avatarı alır
export const avatarFor = (seed, isBot = false) => {
    const key = `${isBot ? 'b' : 'h'}:${seed}`;
    if (!cache.has(key)) {
        const style = isBot ? botttsNeutral : adventurerNeutral;
        cache.set(key, createAvatar(style, { seed: String(seed), radius: 50, backgroundColor: BG }).toDataUri());
    }
    return cache.get(key);
};
