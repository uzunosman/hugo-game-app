import { useEffect, useRef, useState } from 'react';
import { perGroupAt } from '../utils/rackDrag';

// Masadaki tüm sürükle-bırak: fare, dokunmatik ve kalem aynı Pointer Events yolunu kullanır.
//  - Istaka taşı: sürükle → ıstakada yer değiştir, köşeye at, masadaki pere işle (son taş ıstaka dışında her yere: at)
//  - Basılı tut (LONG_PRESS) → taşın satırdaki kesintisiz dizisi geçerli bir perse seçilir; sürükle → per ıstakada taşınır,
//    masaya bırakılırsa el açılır / per indirilir
//  - Deste / yerdeki son taş: ıstakaya sürükle → çek
// Sürüklenen taş yerinden kalkar (ıstakada gölgesi kalmaz); bırakılacağı yer ıstakada canlı gösterilir.
const LONG_PRESS = 380; // ms
const THRESHOLD = 6;    // px: bundan az kımıldama dokunma/tıklama sayılır
// Pere kilitlenme: parmak perin üstüne gelince hedef o per olur; perden STICKY_PX kadar taşsa ya da
// STICKY_MS süre dışarı çıksa da kilit kalır (telefonda parmak taşı örter, küçük perde nişan kayar)
const STICKY_MS = 450;
const STICKY_PX = 36;
// Istakada taşlar hemen kaymasın: parmak bir hücrede bu kadar durunca önizleme o hücreye geçer
const PREVIEW_MS = 170;
const near = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

const cellIndex = (cell) => Number(cell.dataset.cell);

export default function useBoardDrag(props) {
    const latest = useRef(props);
    latest.current = props;
    const [view, setView] = useState(null);
    const session = useRef(null);

    const publish = (patch) => setView(v => {
        const next = { ...v, ...patch };
        return v && Object.keys(next).every(k => next[k] === v[k]) ? v : next;
    });

    // Kaynağı tanı: ıstaka taşı, deste ya da yerden alınabilen taş
    const identify = (target) => {
        const { canDrawFromDeck } = latest.current;
        const cell = target.closest('.tile-holder .tile-cell');
        const tileEl = cell?.querySelector('.tile');
        if (tileEl && tileEl.contains(target)) return { kind: 'tile', srcIdx: cellIndex(cell), el: tileEl };
        const deck = target.closest('.deck-tile-wrapper');
        if (deck && canDrawFromDeck) return { kind: 'deck', el: deck.querySelector('.center-tile') || deck };
        const discard = target.closest('.tile.can-drag');
        if (discard?.dataset.discardedFrom) {
            return { kind: 'discard', corner: discard.dataset.discardedFrom, tileIndex: Number(discard.dataset.index), el: discard };
        }
        return null;
    };

    const hitTest = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const cell = el?.closest('.tile-holder .tile-cell');
        return {
            el,
            overCell: cell ? cellIndex(cell) : null,
            inRack: !!el?.closest('.tile-holder'),
            overSet: el?.closest('[data-hover-key]')?.dataset.hoverKey ?? null,
            overCorner: el?.closest('.tile-drop-zone')?.dataset.corner ?? null,
            overTable: !!el?.closest('.game-board') && !el.closest('.tile-holder-container, .tile-drop-zone'),
        };
    };

    const buildGhost = (s) => {
        const els = s.kind === 'group'
            ? Array.from({ length: s.group.len }, (_, i) =>
                document.querySelector(`.tile-holder .tile-cell[data-cell="${s.group.start + i}"] .tile`)).filter(Boolean)
            : [s.el];
        if (!els.length) return;
        const first = els[0].getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        els.forEach(src => {
            const r = src.getBoundingClientRect();
            const c = src.cloneNode(true);
            c.classList.remove('selected');
            Object.assign(c.style, { width: `${r.width}px`, height: `${r.height}px`, visibility: 'visible', opacity: '1', margin: '0', transform: 'none' });
            ghost.appendChild(c);
        });
        document.body.appendChild(ghost);
        s.ghost = ghost;
        s.ox = s.x0 - first.left;
        s.oy = s.y0 - first.top + (s.pointerType === 'touch' ? 14 : 0); // parmak taşı örtmesin
        moveGhost(s);
    };
    const moveGhost = (s) => {
        if (s.ghost) s.ghost.style.transform = `translate3d(${s.x - s.ox}px, ${s.y - s.oy}px, 0)`;
    };

    const swallowClick = () => {
        const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
    };

    const end = () => {
        const s = session.current;
        if (!s) return;
        session.current = null;
        clearTimeout(s.timer);
        clearTimeout(s.cellTimer);
        // Dinleyiciler basıldığı andaki render'ın fonksiyonlarıdır: aynılarını kaldır
        window.removeEventListener('pointermove', s.h.move);
        window.removeEventListener('pointerup', s.h.up);
        window.removeEventListener('pointercancel', s.h.cancel);
        window.removeEventListener('contextmenu', s.h.ctx, true);
        s.ghost?.remove();
        if (s.kind === 'discard' && s.el) s.el.style.visibility = '';
        if (s.dragging && s.kind === 'tile') latest.current.actions.dragEnd?.();
        setView(null);
    };

    // Basılı tutuldu: per seçilir (tek taşsa tek taş sürüklenmeye devam eder)
    const arm = () => {
        const s = session.current;
        if (!s || s.dragging || s.kind !== 'tile') return;
        const { positions, tiles, setOpts } = latest.current;
        const group = perGroupAt(positions, s.srcIdx, tiles, setOpts); // yalnızca kurala uyan per seçilir
        if (!group) return;
        s.kind = 'group';
        s.group = group;
        s.groupIds = positions.slice(group.start, group.start + group.len);
        navigator.vibrate?.(15);
        publish({ kind: 'group', group, srcIdx: s.srcIdx, dragging: false });
    };

    const startDrag = (s) => {
        clearTimeout(s.timer);
        s.dragging = true;
        buildGhost(s);
        if (s.kind === 'discard') s.el.style.visibility = 'hidden';
        // Yakalama board'a: kaynak taş önizlemede yerinden kalkınca olaylar kesilmesin
        try { s.board?.setPointerCapture(s.pointerId); } catch { /* yakalanamadı: window dinleyicileri yeter */ }
        if (s.kind === 'tile') latest.current.actions.dragStart?.(s.srcIdx);
        publish({ kind: s.kind, srcIdx: s.srcIdx, group: s.group || null, dragging: true, overCell: null, overSet: null, overCorner: null });
    };

    // Sürüklenen taşın kilitlendiği per (yoksa null): doğrudan üstündeki, ya da az önce üstünde olduğu
    const lockSet = (s, hit) => {
        // Kendi köşesinin üstündeyse taş atılır: yakındaki pere kilit bırakılır
        if (hit.overCorner && hit.overCorner === latest.current.playerCorner) { s.lock = null; return null; }
        const el = hit.overSet ? hit.el.closest('[data-hover-key]') : null;
        if (el) {
            if (s.lock?.key !== hit.overSet) navigator.vibrate?.(10);
            s.lock = { key: hit.overSet, setId: el.dataset.setId, rect: el.getBoundingClientRect(), t: Date.now() };
            return s.lock.key;
        }
        const l = s.lock;
        if (l && hit.overCell == null && !hit.inRack && (near(l.rect, s.x, s.y, STICKY_PX) || Date.now() - l.t < STICKY_MS)) {
            if (near(l.rect, s.x, s.y, STICKY_PX)) l.t = Date.now(); // yakınındayken süre işlemez
            return l.key;
        }
        s.lock = null;
        return null;
    };

    // Perin hangi ucuna: parmak perin sol yarısındaysa başa, sağ yarısındaysa sona (okey iki uca da uyar,
    // kullanıcı parmağını kaydırarak seçer; seçilen uçtaki yuva parlar). Uymayan uçta sunucu öbür ucu dener.
    const sideOf = (s) => (s.lock && s.x < s.lock.rect.left + s.lock.rect.width / 2 ? 'start' : 'end');

    const drop = (s, hit) => {
        const { positions, tiles, playerCorner, actions } = latest.current;
        const { el, overCell, inRack, overCorner } = hit;
        if (s.kind === 'group') {
            if (overCell != null) return actions.moveGroup(s.group, s.srcIdx, overCell);
            // Masaya bırakılan per: el açılır ya da per indirilir (köşeye per atılmaz)
            if (hit.overTable) actions.playGroup?.(s.groupIds);
            return;
        }
        if (s.kind === 'deck') {
            if (overCell != null || inRack) actions.drawDeck(overCell ?? positions.indexOf(null));
            return;
        }
        if (s.kind === 'discard') {
            if (overCell == null && !inRack) return;
            const target = overCell != null && !positions[overCell] ? overCell : positions.indexOf(null);
            if (target !== -1) actions.drawDiscard(s.corner, s.tileIndex, target);
            return;
        }
        // Istaka taşı
        if (overCell != null) {
            if (overCell !== s.srcIdx) actions.moveTile(s.srcIdx, overCell);
            return;
        }
        if (inRack) return;
        // Son taş: ıstaka dışında nereye bırakılırsa atılır, el biter
        if (tiles.length === 1) return actions.discard(s.srcIdx);
        if (overCorner && overCorner === playerCorner) return actions.discard(s.srcIdx); // köşe, yakındaki perden önce gelir
        const tileId = s.tileId;
        const slot = el?.closest('.insertion-slot');
        if (slot) return actions.addToSet(tileId, slot.dataset.setId, slot.dataset.position);
        const okey = el?.closest('.open-set-tile.is-okey');
        if (okey) return actions.addToSet(tileId, okey.dataset.setId, 'end');
        const pair = el?.closest('.pair-slot');
        if (pair) return actions.addToSet(tileId, pair.dataset.setId, 'end');
        // Perin üstünde ya da parmak perden kaymış ama kilit sürüyor: parmağın olduğu uca işle
        const lock = s.kind === 'tile' && lockSet(s, hit) && s.lock;
        if (lock) return actions.addToSet(tileId, lock.setId, sideOf(s));
    };

    // Önizlenen hücre: ıstakadan çıkınca hemen boşalır, yeni hücreye PREVIEW_MS bekleyince geçer
    const shownCell = (s, cell) => {
        if (cell === s.shown || cell == null) {
            clearTimeout(s.cellTimer); s.want = undefined;
            s.shown = cell;
            return cell;
        }
        if (s.want !== cell) {
            clearTimeout(s.cellTimer);
            s.want = cell;
            s.cellTimer = setTimeout(() => {
                if (session.current !== s) return;
                s.shown = cell; s.want = undefined;
                publish({ overCell: cell });
            }, PREVIEW_MS);
        }
        return s.shown ?? null;
    };

    function onMove(e) {
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        s.x = e.clientX; s.y = e.clientY;
        if (!s.dragging) {
            if (Math.hypot(s.x - s.x0, s.y - s.y0) < THRESHOLD) return;
            startDrag(s);
        }
        e.preventDefault();
        moveGhost(s);
        const hit = hitTest(s.x, s.y);
        const overSet = s.kind === 'tile' ? lockSet(s, hit) : null;
        publish({ overCell: shownCell(s, hit.overCell), overSet, overSide: overSet ? sideOf(s) : null, overCorner: hit.overCorner, overTable: s.kind === 'group' && hit.overTable });
    }

    function onUp(e) {
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        if (s.dragging) {
            s.x = e.clientX; s.y = e.clientY;
            const hit = hitTest(s.x, s.y);
            swallowClick();
            end();
            drop(s, hit);
            return;
        }
        if (s.kind === 'group') swallowClick(); // per seçip bıraktı: taş seçimi açılmasın
        end();
    }

    function onCancel(e) {
        if (session.current && e.pointerId === session.current.pointerId) end();
    }

    // Per seçiliyken / sürüklerken uzun basış menüsü (ve okey çevirme) açılmaz
    function onContextMenu(e) {
        const s = session.current;
        if (s && (s.dragging || s.kind === 'group')) { e.preventDefault(); e.stopPropagation(); }
    }

    const onPointerDown = (e) => {
        if (session.current || !e.isPrimary || e.button !== 0) return;
        const src = identify(e.target);
        if (!src) return;
        if (e.pointerType === 'mouse') e.preventDefault(); // metin seçimi başlamasın
        const s = {
            ...src, pointerId: e.pointerId, pointerType: e.pointerType, board: e.currentTarget,
            x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dragging: false, group: null,
            shown: src.kind === 'tile' ? src.srcIdx : null,
            tileId: src.kind === 'tile' ? latest.current.positions[src.srcIdx] : null,
        };
        s.h = { move: onMove, up: onUp, cancel: onCancel, ctx: onContextMenu };
        session.current = s;
        if (src.kind === 'tile') s.timer = setTimeout(arm, LONG_PRESS);
        window.addEventListener('pointermove', s.h.move, { passive: false });
        window.addEventListener('pointerup', s.h.up);
        window.addEventListener('pointercancel', s.h.cancel);
        window.addEventListener('contextmenu', s.h.ctx, true);
    };

    useEffect(() => end, []); // sayfadan çıkınca yarım sürükleme temizlenir

    return { dragView: view, onPointerDown };
}
