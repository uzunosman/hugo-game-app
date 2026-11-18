import { useEffect, useRef, useState } from 'react';
import socketService from '../services/socketService';
import Voice from '../utils/voice';

// Masanın sesli sohbeti: bekleme ekranında ve oyunda aynı bağlantı (Room'da kurulur, Game'e geçer).
// Masa ayarı + en az 2 gerçek oyuncu (ya da admin açtı) iken açık; sunucu room:voice ile bildirir.
export default function useVoice(room, playerId, onError) {
    const [voiceOn, setVoiceOn] = useState(!!room?.voice);
    const [busy, setBusy] = useState(false);
    const [, setTick] = useState(0);
    const ref = useRef(null);
    const roomId = room?.id;

    useEffect(() => { setVoiceOn(!!room?.voice); }, [room?.voice]);
    useEffect(() => {
        const s = socketService.socket;
        const onVoice = (d) => { if (d?.roomId === roomId) setVoiceOn(!!d.voice); };
        s?.on('room:voice', onVoice);
        return () => s?.off('room:voice', onVoice);
    }, [roomId]);
    useEffect(() => {
        if (!voiceOn || !playerId) return undefined;
        const v = new Voice(socketService.socket, playerId, () => setTick(t => t + 1));
        ref.current = v;
        setTick(t => t + 1);
        return () => { v.destroy(); ref.current = null; setTick(t => t + 1); };
    }, [voiceOn, playerId]);

    const toggle = async (kind) => {
        const v = ref.current;
        if (!v) return;
        setBusy(true);
        try {
            if (kind === 'mic') await v.setMic(!v.mic); else await v.setSpeaker(!v.speaker);
        } catch (err) {
            onError?.(err?.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi: tarayıcı ayarlarından mikrofona izin ver' : err?.message || 'Sesli sohbet açılamadı');
        }
        setBusy(false);
    };

    const v = ref.current;
    return {
        on: voiceOn && !!v,
        busy,
        mic: !!v?.mic,
        speaker: !!v?.speaker,
        connected: v ? v.connectedCount() : 0,
        isSpeaking: (id) => !!v?.speaking.has(id),
        isMuted: (id) => !!v?.muted.has(id),
        mute: (id, on) => v?.mute(id, on),
        toggleMic: () => toggle('mic'),
        toggleSpeaker: () => toggle('speaker'),
    };
}
