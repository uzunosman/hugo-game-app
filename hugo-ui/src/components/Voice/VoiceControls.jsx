import './Voice.css';

// Sesli sohbet sekmeleri: ceza sekmesinin üstünde mikrofon ve hoparlör (ikisi de başta kapalı). Yalnızca masanın sesli
// sohbeti açıkken görünür (Game). Açıkken amber; bağlı oyuncu sayısı hoparlörün köşesinde.
const MicIcon = ({ off }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
        {off && <path d="M4 4l16 16" />}
    </svg>
);
const SpeakerIcon = ({ off }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {off ? <path d="M17 9l4 6M21 9l-4 6" /> : <><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></>}
    </svg>
);

export default function VoiceControls({ mic, speaker, connected, onMic, onSpeaker, busy }) {
    return (
        <div className="voice-tabs" role="group" aria-label="Sesli sohbet">
            <button type="button" className={`voice-tab ${mic ? 'is-on' : ''}`} aria-pressed={mic} disabled={busy}
                aria-label={mic ? 'Mikrofonu kapat' : 'Mikrofonu aç'} title={mic ? 'Mikrofon açık' : 'Mikrofon kapalı'} onClick={onMic}>
                <MicIcon off={!mic} />
            </button>
            <button type="button" className={`voice-tab ${speaker ? 'is-on' : ''}`} aria-pressed={speaker} disabled={busy}
                aria-label={speaker ? 'Hoparlörü kapat' : 'Hoparlörü aç'} title={speaker ? 'Hoparlör açık' : 'Hoparlör kapalı'} onClick={onSpeaker}>
                <SpeakerIcon off={!speaker} />
                {(mic || speaker) && connected > 0 && <span className="voice-count" aria-label={`${connected} oyuncuya bağlı`}>{connected}</span>}
            </button>
        </div>
    );
}
