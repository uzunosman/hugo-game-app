/* eslint-disable react-refresh/only-export-components -- ortak biçim modülü: bileşen ve yardımcı birlikte */
// Admin ekranlarının ortak biçimleri: taş rozeti, saat / süre, oyun kaydı satırlarının okunur hâli (masa izleme, geçmiş)

const COLOR_TR = { red: 'kırmızı', blue: 'mavi', black: 'siyah', yellow: 'sarı' };
const TR_COLOR = Object.fromEntries(Object.entries(COLOR_TR).map(([k, v]) => [v, k]));
export const STATUS_TR = { waiting: 'bekliyor', playing: 'oyunda', finished: 'bitti' };

export const clock = (t) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const ago = (ms) => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    return s < 60 ? `${s} sn önce` : s < 3600 ? `${Math.round(s / 60)} dk önce` : `${Math.round(s / 3600)} sa önce`;
};
export const duration = (s) => (s < 3600 ? `${Math.round(s / 60)} dk` : s < 86400 ? `${Math.floor(s / 3600)} sa ${Math.round((s % 3600) / 60)} dk` : `${Math.floor(s / 86400)} gün ${Math.floor((s % 86400) / 3600)} sa`);

// "red 5" → küçük taş; sahte okey ayrı
export const Chip = ({ label }) => {
    if (typeof label !== 'string' || !label) return null; // eski kayıtlarda bozuk taş adı olabilir: çizilmez
    if (label === 'sahte okey') return <span className="yp-tile is-joker" title="sahte okey">★</span>;
    const [c, value] = label.split(' ');
    const color = TR_COLOR[c] || c; // ceza kaydında taş adı Türkçe ("kırmızı 7")
    return <span className={`yp-tile c-${color}`} title={`${COLOR_TR[color] || color} ${value}`}>{value}</span>;
};
export const Chips = ({ list }) => <span className="yp-chips">{(list || []).map((l, i) => <Chip key={i} label={l} />)}</span>;
const setLabels = (sets) => (sets || []).map(st => (st.tiles || []).map(t => (t.isJoker ? 'sahte okey' : `${t.color} ${t.value}`)));

const ACTIONS = {
    'game:discardTile': 'attı', 'game:openHand': 'el açtı', 'game:addTileToSet': 'işledi', 'game:addPairToSet': 'çift işledi',
    'game:dropPer': 'per indirdi', 'game:undoTurn': 'geri aldı', 'game:returnTaken': 'kustu', 'game:leaveTable': 'masadan kalktı',
    'player:ready': 'hazır', 'game:start': 'oyunu başlattı', 'player:reconnect': 'yeniden bağlandı', 'room:join': 'masaya oturdu',
};

// Kayıt satırını okunur hâle getirir: { kim, ne, taslar, tur } ya da null (izlemede gösterilmeyen satır)
export const describe = (e) => {
    if (e.ev === 'istek') {
        if (e.ok === false) return { kim: e.oyuncu, ne: `${ACTIONS[e.istek] || e.istek} reddedildi: ${e.hata}`, tur: 'hata', taslar: e.taslar };
        if (e.istek === 'game:drawTile') return { kim: e.oyuncu, ne: e.veri?.fromDiscard ? 'yerden aldı' : 'desteden çekti', taslar: [e.cekilen] };
        if (e.istek === 'chat:send') return { kim: e.oyuncu, ne: `“${e.veri?.text ?? ''}”`, tur: 'sohbet' };
        return null; // hamlenin kendisi masa olayında görünür
    }
    if (e.ev !== 'masa') return null;
    const v = e.veri || {};
    switch (e.olay) {
        case 'game:started': return { ne: 'Oyun başladı', tur: 'bolum', dagitim: e.dagitim };
        case 'game:roundStarted': return { ne: `${e.el}. el başladı`, tur: 'bolum', dagitim: e.dagitim };
        case 'game:roundEnded': return { ne: `${v.round}. el bitti${v.gameStatus === 'finished' ? ' · oyun bitti' : ''}`, tur: 'bolum', sonuc: v.players };
        case 'game:tileDiscard': return { kim: e.kim, ne: 'attı', taslar: [e.tas] };
        case 'game:tileDraw': return { kim: e.kim, ne: v.fromDiscard ? 'yerden aldı' : 'desteden çekti' };
        case 'game:handOpened': return { kim: e.kim, ne: `el açtı (${v.openedTotal ?? '-'})`, setler: setLabels(v.newSets) };
        case 'game:perDropped': return { kim: e.kim, ne: 'per indirdi', setler: setLabels(v.newSets) };
        case 'game:tileAddedToSet': return { kim: e.kim, ne: 'işledi', setler: setLabels(v.updatedSet ? [v.updatedSet] : []) };
        case 'game:tileReturned': return { kim: e.kim, ne: 'kustu', taslar: [e.tas] };
        case 'game:turnUndone': return { kim: e.kim, ne: 'sırasını geri aldı' };
        case 'game:penalty': return { kim: v.playerName, ne: `${v.amount > 0 ? '+' : ''}${v.amount} ceza · ${v.reason}`, tur: v.amount > 0 ? 'ceza' : '', taslar: v.tile ? [v.tile] : undefined };
        case 'player:connection': return { kim: e.kim, ne: v.connected ? 'bağlandı' : 'bağlantısı koptu', tur: v.connected ? '' : 'uyari' };
        case 'player:joined': return { ne: 'masaya oyuncu geldi' };
        case 'player:left': return { ne: 'masadan oyuncu ayrıldı' };
        case 'room:closed': return { ne: `Masa kapandı: ${v.reason}`, tur: 'bolum' };
        default: return null; // game:nextTurn, game:turnExtended, player:ready…
    }
};
