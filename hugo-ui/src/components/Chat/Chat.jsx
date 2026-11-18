import React, { useEffect, useRef, useState } from 'react';
import socketService from '../../services/socketService';
import { avatarFor } from '../../utils/avatar';
import '../../assets/css/components/Chat.css';

const MAX_LEN = 200; // sunucu da aynı sınırı uygular

// Masa sohbeti: sol altta yalnızca simge; dokununca ıstakanın solundaki boşlukta şeffaf panel açılır (cin efekti).
// Klavye panel açılınca değil, yazma alanına dokununca açılır. Kapalıyken okunmamış mesaj sayısı görünür
const Chat = ({ playerId }) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [unread, setUnread] = useState(0);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const openRef = useRef(open);
    openRef.current = open;

    useEffect(() => {
        socketService.chatHistory((r) => { if (r?.success) setMessages(r.messages || []); });
        const onMessage = (m) => {
            setMessages(prev => [...prev, m].slice(-50));
            if (!openRef.current && m.playerId !== playerId) setUnread(n => n + 1);
            // Yönetici mesajı sohbet kapalıyken de görünsün: ekranın üstünde kısa duyuru
            if (m.admin && !openRef.current) window.dispatchEvent(new CustomEvent('hugo:announce', { detail: { text: `Yönetici: ${m.text}` } }));
        };
        socketService.onChatMessage(onMessage);
        return () => socketService.offChatMessage(onMessage);
    }, [playerId]);

    useEffect(() => {
        if (open) setUnread(0); // yazma alanına odaklanılmaz: telefonda klavye kendiliğinden açılmasın
    }, [open]);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages.length, open]);

    const send = (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        socketService.sendChat(t, (r) => {
            if (r?.success) { setText(''); setError(''); }
            else setError(r?.error || 'Mesaj gönderilemedi');
        });
    };

    return (
        <aside className={`chat ${open ? 'is-open' : ''}`} aria-label="Masa sohbeti">
            {open && (
                <div className="chat-panel">
                    <ul className="chat-list" ref={listRef} aria-live="polite">
                        {messages.length === 0 && <li className="chat-empty">Masaya ilk mesajı sen yaz.</li>}
                        {messages.map(m => (
                            <li key={m.id} className={m.admin ? 'is-admin' : m.playerId === playerId ? 'mine' : undefined}>
                                {m.admin ? <span className="chat-avatar chat-admin-badge" aria-hidden="true">Y</span> : <img src={avatarFor(m.playerId)} alt="" className="chat-avatar" />}
                                <span className="chat-bubble"><b>{m.name}</b> {m.text}</span>
                            </li>
                        ))}
                    </ul>
                    <form className="chat-form" onSubmit={send}>
                        <input
                            ref={inputRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            maxLength={MAX_LEN}
                            placeholder="Mesaj yaz"
                            aria-label="Mesaj"
                            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
                        />
                        <button type="submit" disabled={!text.trim()}>Gönder</button>
                    </form>
                    {error && <p className="chat-error" role="alert">{error}</p>}
                </div>
            )}
            <button type="button" className="chat-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Sohbet" title="Sohbet">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {unread > 0 && <span className="chat-unread" aria-label={`${unread} okunmamış`}>{unread}</span>}
            </button>
        </aside>
    );
};

export default Chat;
