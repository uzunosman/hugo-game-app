import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import TileHolder from '../TileHolder/TileHolder';
import CenterArea from '../CenterArea/CenterArea';
import DiscardAreas from '../DiscardAreas/DiscardAreas';
import OpenSetsArea from '../OpenSetsArea/OpenSetsArea';
import useBoardDrag from '../../hooks/useBoardDrag';
import { fitTable } from '../../utils/tableFit';
import { stageScale } from '../../utils/stage';
import socketService from '../../services/socketService';
import { animateOwn, flyClone, holdSet, PLACE_MS, rackTileEl, slideFrom, tileLooks, tileOrigins, whenRendered } from '../../utils/flyTiles';
import '../../assets/css/components/GameBoard.css';

/**
 * Oyun tahtası: köşeler, masadaki perler, deste ve ıstaka.
 * Sürükle-bırak useBoardDrag'da (Pointer Events; fare, dokunmatik ve kalem aynı yol):
 *  ıstaka taşı → ıstaka / köşe / per, basılı tutulan per → ıstaka ya da masa (el aç / per indir),
 *  deste ya da yerdeki taş → ıstaka.
 */
const GameBoard = ({
    tiles,
    tilePositions,
    discardedTiles,
    handleTileClick,
    handleTileMove,
    handleTileDoubleClick,
    handleDrawTile,
    handleDrawDiscardedTile,
    handleDrawFromDeck,
    isMyTurn,
    turnAction,
    playerCorner,
    lastDiscardCorner,
    deckCount,
    indicatorTile,
    okeyTile,
    gameRound,
    isHugoRound,
    onArrange,
    onTapDiscard,
    kustuCorner,
    onKustu,
    selectedTile,
    tableSets,
    orderedPlayers,
    selectedTileId,
    activeTile,
    onAddTileToSet,
    onAddPairToSet,
    onTileDragStart,
    onTileDragEnd,
    flippedTileIds,
    islekIds, // yardımlı masa: işlek taşlar (ıstakada işaretli)
    islekBlocked, // işlek taş atılamaz (elde atılabilecek başka taş var)
    onOkeyFlip,
    onGroupMove,
    onPlayGroup,
    pendingSetIds,
    onWarn,
    canPlaySets,
    canSeeDiscards,
    rejectId, // hamle reddedildi: gizlenen taş bırakıldığı yerden ıstakaya kayar
    kustuTileId
}) => {
    const isFirstHandBlock = tiles.length === 15 && turnAction === 'draw';
    const canDrawFromDeck = isMyTurn && turnAction === 'draw' && !isFirstHandBlock;

    // Istakadan çıkan taş (atılan, işlenen, yere açılan) sunucu cevabına kadar ıstakada gizli kalır: eski yerinde yeniden belirmez.
    // Cevap gelince taş elden çıkar; hamle reddedilirse taş bırakıldığı yerden ıstakadaki yerine kayar (en geç 1,5 sn'de görünür).
    const [hiddenIds, setHiddenIds] = useState(() => new Set());
    const hideTimer = useRef(null);
    const outRect = useRef(null); // taşın ıstakadan çıkıp gittiği yer (reddedilince oradan geri kayar)
    // from: bırakılan yer (tek dikdörtgen ya da taş başına dizi); reddedilince taş oradan ıstakaya kayar
    const hide = (ids, from) => {
        const rectOf = (i) => (Array.isArray(from) ? from[i] : from);
        ids.forEach((id, i) => {
            if (!id || !rectOf(i)) return;
            tileOrigins.set(id, rectOf(i)); // yere açılışta / işlemede uçuş buradan başlar
            const el = rackTileEl(id); // ıstakadaki görünüm: yerine süzülürken masa taşına dönüşür
            if (el && !tileLooks.has(id)) tileLooks.set(id, { el: el.cloneNode(true), w: el.offsetWidth, h: el.offsetHeight });
        });
        outRect.current = rectOf(0) || null;
        setHiddenIds(new Set(ids.filter(Boolean)));
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setHiddenIds(new Set()), 1500);
    };
    useEffect(() => { setHiddenIds(prev => (prev.size ? new Set() : prev)); }, [tiles]);
    const hiddenRef = useRef(hiddenIds);
    hiddenRef.current = hiddenIds;
    useEffect(() => {
        const ids = [...hiddenRef.current];
        if (!rejectId || !ids.length) return;
        const from = outRect.current;
        setHiddenIds(new Set());
        ids.forEach(id => whenRendered(() => rackTileEl(id), el => slideFrom(el, from)));
    }, [rejectId]);
    useEffect(() => () => clearTimeout(hideTimer.current), []);
    const canDiscardNow = isMyTurn && (turnAction === 'discard' || isFirstHandBlock);
    // Atma: çift tık / seçip köşeye dokununca taş köşeye yavaşça uçar; sürükleyip bırakınca atan oyuncu animasyon görmez
    // (diğer oyuncular atanın kartından köşeye uçuşu görür). Taş sunucu cevabına kadar ıstakada gizli kalır.
    const discard = (idx, dropRect) => {
        // Yandan alınan taş henüz ıstakadaysa (kullanılmadı) hiçbir taş atılamaz: uçuş başlamaz, uyarı hemen çıkar.
        // Sürükleyerek bırakılan taş ıstakadaki yerine kayarak döner (useBoardDrag)
        if (canDiscardNow && kustuTileId && tilePositions.includes(kustuTileId)) {
            onWarn?.(tilePositions[idx] === kustuTileId
                ? 'Yandan aldığın taş atılamaz: pere ekle ya da Kustu ile geri koy'
                : 'Önce yandan aldığın taşı kullan: pere ekle ya da Kustu ile geri koy');
            return;
        }
        // Yardımlı masa: işlek taş çift tık / köşeye dokunmayla atılmaz; taş yerinde sallanır, nasıl atılacağı söylenir.
        // Sürükleyip köşeye bırakmak (dropRect) bilerek atmadır: atılır, işlek cezası yazılır
        const forced = !!dropRect && islekBlocked && islekIds?.has(tilePositions[idx]);
        if (canDiscardNow && islekBlocked && islekIds?.has(tilePositions[idx]) && !dropRect) {
            rackTileEl(tilePositions[idx])?.animate?.([
                { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
                { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' },
            ], { duration: 360, easing: 'ease-out' });
            onWarn?.('Bu taş işlek (masadaki bir pere işlenebilir). Yine de atmak istersen sürükleyip köşeye bırak: işlek cezası yazılır');
            return;
        }
        if (canDiscardNow && forced) socketService.forceDiscardAt = Date.now();
        if (canDiscardNow) {
            const id = tilePositions[idx];
            const el = rackTileEl(id);
            const from = el?.getBoundingClientRect();
            if (!dropRect && el && from) {
                const zone = document.querySelector(`.tile-drop-zone[data-corner="${playerCorner}"]`);
                const top = zone?.querySelector('.discard-top .tile')?.getBoundingClientRect();
                const z = zone?.getBoundingClientRect();
                const to = top || (z && { left: z.left + (z.width - from.width) / 2, top: z.top + (z.height - from.height) / 2, width: from.width, height: from.height });
                if (zone && to) {
                    // Köşedeki eski taş görünür kalır; atılan taş köşeye çizilince uçuş bitene kadar gizlenir, sonra üstüne iner
                    const landedEl = () => zone.querySelector(`.discard-top .tile[data-tile-id="${id}"]`);
                    let flown = false; // uçuş bittiyse (ya da vazgeçildiyse) sonradan gelen taş gizlenmez
                    // Alttaki eski taş yalnızca yeni taş köşeye çizilip gizlendiği anda görünür (öncesinde üst taş zaten eski taş)
                    whenRendered(landedEl, (t) => { if (!flown) { t.style.visibility = 'hidden'; zone.dataset.flight = '1'; } });
                    flyClone(el, from, to, PLACE_MS, () => { flown = true; delete zone.dataset.flight; const t = landedEl(); if (t) t.style.visibility = ''; },
                        () => !!landedEl() || !!rackTileEl(id)); // köşeye geldi ya da reddedildi
                }
            }
            hide([id], dropRect || from);
        }
        handleTileDoubleClick(idx);
    };

    // Tüm sürükle-bırak (fare + dokunmatik) tek yoldan: useBoardDrag
    const { dragView, onPointerDown } = useBoardDrag({
        positions: tilePositions,
        tiles,
        playerCorner,
        kustuCorner,
        kustuTileId,
        canDrawFromDeck,
        setOpts: { okeyTile, isHugo: isHugoRound },
        actions: {
            moveTile: handleTileMove,
            moveGroup: onGroupMove,
            playGroup: (ids, from) => { if (canDiscardNow) hide(ids, from); onPlayGroup(ids); }, // per masaya sürüklendi: el aç / per indir
            discard, // köşeye atma ile aynı yol (sıra / aşama kontrolü orada)
            // Sürükleyerek işleme: taş bırakıldığı yerden perdeki yerine süzülür, per inene kadar büyük kalır
            addToSet: (tileId, setId, side, from) => { if (canPlaySets) { holdSet(setId, tileId); hide([tileId], from); } onAddTileToSet(tileId, setId, side); },
            addPair: (ids, setId, from) => { if (canPlaySets) { hide(ids, from); ids.forEach(id => animateOwn.add(id)); } onAddPairToSet(ids, setId); },
            kustu: () => onKustu(false), // sürükleyerek kusma: atan oyuncu animasyon görmez
            drawDeck: handleDrawFromDeck,
            drawDiscard: handleDrawDiscardedTile,
            dragStart: onTileDragStart,
            dragEnd: onTileDragEnd,
        },
    });

    // Hiçbir taş üst üste gelmesin: orta taşlar ve yan perler dikeyde boşluğa kayar, sığmazsa küçülür (utils/tableFit)
    const boardRef = useRef(null);
    const refit = useRef(null);
    useEffect(() => () => clearTimeout(refit.current), []);
    useLayoutEffect(() => {
        const place = () => {
            const board = boardRef.current;
            const box = board?.querySelector('.open-sets-container');
            const deck = board?.querySelectorAll('.center-tiles > *');
            if (!box || !deck?.length) return;
            // Sürüklerken (büyüyen per, büyüyen köşe) ölçü bozulmasın: yerleşim sabit kalır
            if (board.classList.contains('is-dragging') || box.querySelector('.open-set-group.expanded')) return;
            // Bırakınca büyümüş per küçülürken (geçiş animasyonu) ölçülmez: yanlış ölçüyle perler kayıp geri gelmesin
            if ([...box.querySelectorAll('.open-set-group')].some(g => g.getAnimations?.().length)) {
                clearTimeout(refit.current);
                refit.current = setTimeout(place, 360);
                return;
            }
            const q = (pos) => box.querySelector(`.open-sets-${pos}`);
            const areas = { top: q('top'), bottom: q('bottom'), left: q('left'), right: q('right') };
            // Önce varsayılan yerlere dön, sonra ölç (aynı karede: titreme olmaz)
            board.style.removeProperty('--center-y');
            Object.values(areas).forEach(el => { el?.style.removeProperty('--fit-y'); el?.style.removeProperty('--fit-s'); });
            const o = box.getBoundingClientRect();
            const k = stageScale(); // ölçüler sahne biriminde (CSS'e yazılan konumlar)
            const rel = (r) => ({ x0: (r.left - o.left) / k, x1: (r.right - o.left) / k, y0: (r.top - o.top) / k, y1: (r.bottom - o.top) / k });
            const groups = (el) => (el ? [...el.querySelectorAll('.open-set-group, .pair-slot')].map(g => rel(g.getBoundingClientRect())) : []);
            const c = [...deck].map(el => el.getBoundingClientRect());
            const center = rel({ left: Math.min(...c.map(r => r.left)), right: Math.max(...c.map(r => r.right)), top: Math.min(...c.map(r => r.top)), bottom: Math.max(...c.map(r => r.bottom)) });
            // Sabit engeller: köşeler ve masaya biraz binen kendi kartın (perler altında kalmasın)
            const fixed = [...board.querySelectorAll('.tile-drop-zone'), ...document.querySelectorAll('.player-panel.current-player')]
                .map(z => rel(z.getBoundingClientRect()));
            const sides = ['left', 'right'].filter(k => areas[k]).map(k => {
                const a = rel(areas[k].getBoundingClientRect());
                return { k, a, rects: groups(areas[k]), originX: k === 'left' ? a.x0 : a.x1, originY: (a.y0 + a.y1) / 2 };
            });
            const fit = fitTable({ H: o.height / k, top: groups(areas.top), bottom: groups(areas.bottom), center, sides, fixed });
            board.style.setProperty('--center-y', `${Math.round(fit.centerY)}px`);
            if (fit.topScale < 1) { areas.top?.style.setProperty('--fit-s', fit.topScale); areas.bottom?.style.setProperty('--fit-s', fit.bottomScale); }
            sides.forEach(({ k, a }, i) => {
                areas[k].style.setProperty('--fit-y', `${Math.round((a.y0 + a.y1) / 2 + fit.sides[i].dy)}px`);
                if (fit.sides[i].s < 1) areas[k].style.setProperty('--fit-s', fit.sides[i].s);
            });
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    });

    return (
        <div ref={boardRef} className={`game-board ${dragView?.dragging ? 'is-dragging' : ''} ${dragView?.dragging && dragView.kind === 'tile' ? 'drag-tile' : ''} ${dragView?.overTable ? 'drop-table' : ''} ${dragView?.dragging && dragView.kind === 'group' && dragView.group?.len === 2 ? 'drag-pair' : ''}`} onPointerDown={onPointerDown}>
            <div className="board-content">
                {/* Köşe Bırakma Alanları */}
                <DiscardAreas
                    discardedTiles={discardedTiles}
                    dragOverCorner={dragView?.dragging && dragView.kind === 'tile' ? dragView.overCorner : null}
                    handleDrawDiscardedTile={handleDrawDiscardedTile}
                    isMyTurn={isMyTurn}
                    turnAction={turnAction}
                    playerCorner={playerCorner}
                    tilesLength={tiles.length}
                    lastDiscardCorner={lastDiscardCorner}
                    hasSelection={selectedTile !== null && selectedTile !== undefined}
                    onTapDiscard={() => { discard(selectedTile); onTapDiscard?.(); }}
                    kustuCorner={kustuCorner}
                    canSeeHistory={canSeeDiscards}
                    onKustu={onKustu}
                />

                {/* Masadaki Açık Setler */}
                <OpenSetsArea
                    tableSets={tableSets || []}
                    players={orderedPlayers || []}
                    selectedTileId={selectedTileId}
                    activeTile={activeTile}
                    onAddTileToSet={onAddTileToSet}
                    okeyTile={okeyTile}
                    isHugo={isHugoRound}
                    dragOverKey={dragView?.dragging ? dragView.overSet : null}
                    dragOverPairs={dragView?.dragging ? dragView.overPairs : null}
                    dragOverSide={dragView?.dragging ? dragView.overSide : null}
                    pendingSetIds={pendingSetIds}
                    canPlay={canPlaySets}
                />

                {/* Merkez Alan */}
                <CenterArea
                    onDrawTile={() => (isMyTurn && isFirstHandBlock ? onWarn?.('İlk elde taş çekilmez: bir taş at') : handleDrawTile(false))}
                    canDrawTile={canDrawFromDeck}
                    remainingTiles={Array(deckCount ?? 0).fill(null)}
                    openTile={indicatorTile}
                    gameRound={gameRound}
                    isHugoRound={isHugoRound}
                />

                {/* Oyuncunun Taşları */}
                <TileHolder
                    tiles={tiles}
                    tilePositions={tilePositions}
                    onTileClick={handleTileClick}
                    onTileDoubleClick={(idx) => discard(idx)}
                    hiddenIds={hiddenIds}
                    selectedTileIndex={selectedTile}
                    dragView={dragView}
                    okeyTile={okeyTile}
                    isHugo={isHugoRound}
                    flippedTileIds={flippedTileIds || new Set()}
                    islekIds={islekIds}
                    onOkeyFlip={onOkeyFlip}
                    onArrange={onArrange}
                />
            </div>
        </div>
    );
};

export default GameBoard;
