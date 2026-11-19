import { useEffect, useState } from 'react';
import socketService, { accountLink } from '../../services/socketService';
import { avatarFor } from '../../utils/avatar';

// Hesabım: adını değiştir, çıkış yap, "Hesabımı başka cihaza taşı" bağlantısı (arkadaşlar o cihazda da görünür)
export default function AccountDialog({ player, onClose, onPlayer }) {
    const link = accountLink();
    const [done, setDone] = useState('');
    const [name, setName] = useState(player.name);
    const [nameMsg, setNameMsg] = useState('');
    const [leaving, setLeaving] = useState(false);
    const saveName = (e) => {
        e.preventDefault();
        const clean = name.trim();
        if (!clean || clean === player.name) return;
        socketService.renamePlayer(clean, (r) => {
            if (r?.success) { onPlayer(r.player); setNameMsg('Adın değişti'); } else setNameMsg(r?.error || 'Ad değiştirilemedi');
        });
    };
    const logout = () => { socketService.logout(); onPlayer(null); onClose(); };
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    const copy = async () => {
        try { await navigator.clipboard.writeText(link); setDone('Bağlantı kopyalandı'); } catch { setDone('Kopyalanamadı: bağlantıyı seçip kopyala'); }
    };
    const share = async () => {
        try { await navigator.share({ title: 'Hugo hesabım', url: link }); } catch { /* vazgeçildi */ }
    };
    return (
        <div className="sdialog-back" onClick={onClose}>
            <section className="sdialog" role="dialog" aria-modal="true" aria-labelledby="acc-title" onClick={(e) => e.stopPropagation()}>
                <div className="sdialog-head">
                    <img src={avatarFor(player.id)} alt="" />
                    <h2 id="acc-title">{player.name}</h2>
                    <button type="button" className="sdialog-x" onClick={onClose} aria-label="Kapat">×</button>
                </div>
                <form className="sdialog-name" onSubmit={saveName}>
                    <label htmlFor="acc-name">Adın</label>
                    <input id="acc-name" value={name} maxLength={20} onChange={(e) => { setName(e.target.value); setNameMsg(''); }} />
                    <button type="submit" className="sbtn sbtn-amber" disabled={!name.trim() || name.trim() === player.name}>Kaydet</button>
                </form>
                {nameMsg && <p className="sdialog-note" role="status">{nameMsg}</p>}
                <h3>Hesabımı başka cihaza taşı</h3>
                {link ? (
                    <>
                        <p>Bu bağlantıyı yeni cihazında aç: arkadaşların ve davetlerin orada da görünür. Bağlantı şifren gibidir, yalnızca kendine gönder.</p>
                        <input className="sdialog-link" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Hesap bağlantısı" />
                        <div className="sdialog-actions">
                            {navigator.share && <button type="button" className="sbtn sbtn-amber" onClick={share}>Paylaş</button>}
                            <button type="button" className="sbtn sbtn-line-dark" onClick={copy}>Kopyala</button>
                        </div>
                        {done && <p className="sdialog-note" role="status">{done}</p>}
                    </>
                ) : <p>Hesap bağlantısı ilk masaya oturunca hazırlanır.</p>}
                <h3>Çıkış yap</h3>
                {leaving ? (
                    <>
                        <p>Bu cihaz seni unutur. Arkadaşlarını geri almak için önce yukarıdaki bağlantıyı kendine gönder.</p>
                        <div className="sdialog-actions">
                            <button type="button" className="sbtn sbtn-go" onClick={logout}>Çıkış yap</button>
                            <button type="button" className="sbtn sbtn-line-dark" onClick={() => setLeaving(false)}>Vazgeç</button>
                        </div>
                    </>
                ) : <button type="button" className="sbtn sbtn-line-dark" onClick={() => setLeaving(true)}>Çıkış yap</button>}
            </section>
        </div>
    );
}
