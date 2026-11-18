// Sesli sohbet (WebRTC): masada sese katılan oyuncular birbirine doğrudan bağlanır (en çok 3 bağlantı). Sunucu yalnızca
// bağlantı kurma mesajlarını aktarır (voice:join / voice:signal / voice:peer-joined / voice:peer-left).
// Mikrofon ve hoparlör ayrı: ikisi de kapalıyken sesten çıkılır. Susturma yalnızca bu cihazda (karşıdakinin sesi çalınmaz).
// Sese yeni katılan, öncekilere teklif gönderir; öncekiler cevaplar (aynı anda iki teklif olmaz).
// Konuşan: her ses akışının (ve kendi mikrofonunun) seviyesi 150 ms'de bir ölçülür; eşiği geçen 600 ms "konuşuyor" sayılır.

const SPEAK_LEVEL = 0.025; // RMS eşiği (0-1)
const SPEAK_HOLD_MS = 600;

export default class Voice {
    constructor(socket, playerId, onChange) {
        this.socket = socket;
        this.playerId = playerId;
        this.onChange = onChange || (() => {});
        this.peers = new Map(); // playerId → { pc, tr, audio }
        this.muted = new Set();
        this.mic = false;
        this.speaker = false;
        this.stream = null;
        this.joined = false;
        this.iceServers = [];
        this.ctx = null;           // ses seviyesi ölçümü (AudioContext): ilk dokunuşta açılır (tarayıcı kuralı)
        this.meters = new Map();   // playerId → { analyser, data, lastLoud }
        this.speaking = new Set();
        this.meterTimer = null;
        this.onPeerLeft = ({ playerId: id }) => this.drop(id);
        this.onSignal = (m) => this.handleSignal(m).catch(err => console.warn('Ses bağlantısı:', err?.message));
        socket.on('voice:peer-left', this.onPeerLeft);
        socket.on('voice:signal', this.onSignal);
    }

    emitAck(event, data) {
        return new Promise(res => this.socket.emit(event, data, res));
    }

    signal(to, data) {
        this.socket.emit('voice:signal', { playerId: this.playerId, to, data });
    }

    async join() {
        if (this.joined) return;
        const r = await this.emitAck('voice:join', { playerId: this.playerId });
        if (!r?.success) throw new Error(r?.error || 'Sesli sohbete katılınamadı');
        this.joined = true;
        this.iceServers = r.iceServers || [];
        for (const id of r.peers) await this.offer(id);
        this.onChange();
    }

    leave() {
        if (!this.joined) return;
        this.socket.emit('voice:leave', { playerId: this.playerId });
        [...this.peers.keys()].forEach(id => this.drop(id));
        this.joined = false;
        this.onChange();
    }

    createPeer(id) {
        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        const audio = new Audio();
        audio.autoplay = true;
        audio.playsInline = true;
        const peer = { pc, tr: null, audio };
        pc.ontrack = (e) => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); this.applyAudio(id); this.meter(id, audio.srcObject); };
        pc.onicecandidate = (e) => { if (e.candidate) this.signal(id, { candidate: e.candidate }); };
        pc.onconnectionstatechange = () => this.onChange();
        this.peers.set(id, peer);
        return peer;
    }

    async offer(id) {
        const peer = this.createPeer(id);
        peer.tr = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
        await this.attachMic(peer);
        await peer.pc.setLocalDescription(await peer.pc.createOffer());
        this.signal(id, { sdp: peer.pc.localDescription });
    }

    async handleSignal({ from, data }) {
        if (!this.joined) return;
        let peer = this.peers.get(from);
        if (data?.sdp) {
            if (data.sdp.type === 'offer') {
                if (peer) this.drop(from); // yeniden teklif: eski bağlantı kapanır
                peer = this.createPeer(from);
                await peer.pc.setRemoteDescription(data.sdp);
                peer.tr = peer.pc.getTransceivers()[0];
                if (peer.tr) peer.tr.direction = 'sendrecv';
                await this.attachMic(peer);
                await peer.pc.setLocalDescription(await peer.pc.createAnswer());
                this.signal(from, { sdp: peer.pc.localDescription });
            } else if (peer) {
                await peer.pc.setRemoteDescription(data.sdp);
            }
        } else if (data?.candidate && peer) {
            try { await peer.pc.addIceCandidate(data.candidate); } catch { /* geç gelen aday */ }
        }
    }

    async attachMic(peer) {
        const track = this.mic && this.stream ? this.stream.getAudioTracks()[0] : null;
        try { await peer.tr?.sender.replaceTrack(track); } catch { /* bağlantı kapanıyor */ }
    }

    drop(id) {
        const peer = this.peers.get(id);
        if (!peer) return;
        this.unmeter(id);
        peer.pc.close();
        peer.audio.srcObject = null;
        this.peers.delete(id);
        this.onChange();
    }

    applyAudio(id) {
        const peer = this.peers.get(id);
        if (!peer) return;
        peer.audio.muted = !this.speaker || this.muted.has(id);
        if (!peer.audio.muted) peer.audio.play?.().catch(() => {});
    }

    // Mikrofon: izin istenir; kapanınca mikrofon tamamen bırakılır (tarayıcının kayıt işareti söner)
    async setMic(on) {
        if (on && !this.stream) {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        }
        this.mic = on;
        this.ensureCtx();
        if (!on && this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.unmeter(this.playerId); }
        if (on && this.stream) this.meter(this.playerId, this.stream);
        await this.sync();
        await Promise.all([...this.peers.values()].map(p => this.attachMic(p)));
        this.onChange();
    }

    // Hoparlör: dokunuşla açılır (iOS sesin çalınmasına ancak kullanıcı hareketinden sonra izin verir)
    async setSpeaker(on) {
        this.speaker = on;
        this.ensureCtx();
        await this.sync();
        [...this.peers.keys()].forEach(id => this.applyAudio(id));
        this.onChange();
    }

    async sync() {
        if (this.mic || this.speaker) await this.join();
        else this.leave();
    }

    mute(id, on) {
        if (on) this.muted.add(id); else this.muted.delete(id);
        this.applyAudio(id);
        this.onChange();
    }

    // ── Konuşan ölçümü ──
    ensureCtx() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            this.ctx = new Ctx();
            this.meterTimer = setInterval(() => this.tick(), 150);
            // Ölçüm açılmadan gelen akışlar şimdi bağlanır
            this.peers.forEach((p, id) => { if (p.audio.srcObject) this.meter(id, p.audio.srcObject); });
            if (this.stream) this.meter(this.playerId, this.stream);
        }
        this.ctx.resume?.().catch(() => {});
    }

    meter(id, stream) {
        if (!this.ctx || !stream?.getAudioTracks().length) return;
        this.unmeter(id);
        try {
            const source = this.ctx.createMediaStreamSource(stream);
            const analyser = this.ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser); // hoparlöre bağlanmaz: ses <audio> ile çalınır, burada yalnızca ölçülür
            this.meters.set(id, { source, analyser, data: new Float32Array(analyser.fftSize), lastLoud: 0 });
        } catch { /* tarayıcı akışı ölçmeye izin vermedi */ }
    }

    unmeter(id) {
        const m = this.meters.get(id);
        if (!m) return;
        try { m.source.disconnect(); } catch { /* zaten kopuk */ }
        this.meters.delete(id);
        if (this.speaking.delete(id)) this.onChange();
    }

    tick() {
        const now = Date.now();
        let changed = false;
        this.meters.forEach((m, id) => {
            m.analyser.getFloatTimeDomainData(m.data);
            let sum = 0;
            for (let i = 0; i < m.data.length; i++) sum += m.data[i] * m.data[i];
            if (Math.sqrt(sum / m.data.length) > SPEAK_LEVEL) m.lastLoud = now;
            const on = now - m.lastLoud < SPEAK_HOLD_MS && (id !== this.playerId || this.mic);
            if (on !== this.speaking.has(id)) { changed = true; if (on) this.speaking.add(id); else this.speaking.delete(id); }
        });
        if (changed) this.onChange();
    }

    connectedCount() {
        return [...this.peers.values()].filter(p => p.pc.connectionState === 'connected').length;
    }

    destroy() {
        this.leave();
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
        clearInterval(this.meterTimer);
        this.meters.forEach((_, id) => this.unmeter(id));
        this.ctx?.close?.().catch(() => {});
        this.socket.off('voice:peer-left', this.onPeerLeft);
        this.socket.off('voice:signal', this.onSignal);
    }
}
