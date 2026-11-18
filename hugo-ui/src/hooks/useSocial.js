import { useCallback, useEffect, useState } from 'react';
import socketService from '../services/socketService';

// Arkadaşlar, istekler, çevrimiçi oyuncular: kayıtlı oyuncu için 10 sn'de bir ve değişiklik bildirilince tazelenir
export default function useSocial(playerId) {
    const [state, setState] = useState(null);
    const refresh = useCallback(() => {
        if (!playerId || !socketService.socket) return;
        socketService.socialState((r) => { if (r?.success) setState(r); });
    }, [playerId]);

    useEffect(() => {
        if (!playerId) { setState(null); return undefined; }
        refresh();
        const t = setInterval(refresh, 10_000);
        const s = socketService.socket;
        s?.on('friends:changed', refresh);
        return () => { clearInterval(t); s?.off('friends:changed', refresh); };
    }, [playerId, refresh]);

    const act = (fn) => (...args) => new Promise(res => fn.call(socketService, ...args, (r) => { refresh(); res(r || {}); }));
    return {
        state,
        refresh,
        request: act(socketService.friendRequest),
        respond: act(socketService.friendRespond),
        remove: act(socketService.friendRemove),
    };
}
