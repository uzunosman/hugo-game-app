// Oyun geçmişi (admin → Geçmiş): oyuncu ara → oyunları → bir oyunun elleri → bir elin dağıtımı ve bütün hamleleri.
// Kaynak oyun kaydı (events): el başında "dagitim" (eller, gösterge, okey), el sonunda game:roundEnded, aradaki her istek
// ve masa olayı (oyun ve el numarasıyla). Oyuncular ada göre bulunur (eski kayıtlarda oyuncu kimliği oturuma göre değişir).
import { pool } from '../db/db';

const db = () => {
    if (!pool) throw new Error('Oyun geçmişi için veritabanı gerekli');
    return pool;
};
const DEALS = `type = 'masa' AND data->>'olay' IN ('game:started', 'game:roundStarted')`;
const isBotName = (n: string) => /^Robo |^Yapay zekâ/.test(n);

export const searchPlayers = async (q: unknown) => {
    const term = String(q ?? '').trim().slice(0, 40);
    const { rows } = await db().query(
        `SELECT name, count(DISTINCT game)::int AS games, max(at) AS last FROM (
            SELECT jsonb_object_keys(data->'dagitim'->'eller') AS name, data->>'oyun' AS game, at FROM events WHERE ${DEALS}
         ) x WHERE name ILIKE $1 GROUP BY name ORDER BY max(at) DESC LIMIT 40`, [`%${term.replace(/[%_]/g, '')}%`]);
    return rows.filter(r => !isBotName(r.name));
};

// Oyuncunun oyunları: tarih, masa, oyuncular, kaçıncı ele kadar, son puanlar
export const playerGames = async (name: unknown) => {
    const n = String(name ?? '').slice(0, 40);
    const games = (await db().query(
        `SELECT data->>'oyun' AS game, table_no, min(at) AS started, max(at) AS last_deal, max((data->>'el')::int) AS rounds,
                (array_agg(data->'dagitim'->'eller' ORDER BY id))[1] AS hands
         FROM events WHERE ${DEALS} AND data->'dagitim'->'eller' ? $1
         GROUP BY 1, 2 ORDER BY started DESC LIMIT 60`, [n])).rows;
    if (!games.length) return [];
    const ends = (await db().query(
        `SELECT DISTINCT ON (data->>'oyun') data->>'oyun' AS game, data->'veri'->>'gameStatus' AS status, data->'veri'->'players' AS players
         FROM events WHERE type = 'masa' AND data->>'olay' = 'game:roundEnded' AND data->>'oyun' = ANY($1)
         ORDER BY data->>'oyun', id DESC`, [games.map(g => g.game)])).rows;
    const byGame = new Map(ends.map(e => [e.game, e]));
    return games.map(g => {
        const end = byGame.get(g.game);
        return {
            game: g.game, tableNo: g.table_no, started: g.started, rounds: g.rounds,
            players: Object.keys(g.hands || {}),
            finished: end?.status === 'finished',
            scores: (end?.players || []).map((p: any) => ({ name: p.name, total: p.totalScore ?? p.score ?? 0 })),
        };
    });
};

// Bir oyunun elleri: her elin sonucu (el puanı, toplam), Hugo eli, bitiren
export const gameRounds = async (game: unknown) => {
    const { rows } = await db().query(
        `SELECT table_no, (data->>'el')::int AS el, data->'veri' AS v FROM events
         WHERE type = 'masa' AND data->>'olay' = 'game:roundEnded' AND data->>'oyun' = $1 ORDER BY id`, [String(game ?? '')]);
    return rows.map(r => ({
        round: Number(r.v?.round ?? r.el), tableNo: r.table_no, hugo: !!r.v?.isHugoRound,
        results: (r.v?.results || []).map((x: any) => ({ name: x.playerName, roundTotal: x.roundTotal, total: x.totalScore, finisher: !!x.isFinisher })),
    }));
};

// Bir elin bütün kaydı (el başı dağıtımı dahil), olduğu sırayla
export const roundEvents = async (game: unknown, round: unknown) => {
    const { rows } = await db().query(
        `SELECT at, type, data FROM events WHERE data->>'oyun' = $1 AND data->>'el' = $2 ORDER BY id LIMIT 4000`,
        [String(game ?? ''), String(Number(round))]);
    return rows.map(r => ({ t: r.at.toISOString(), ev: r.type, ...r.data }));
};
