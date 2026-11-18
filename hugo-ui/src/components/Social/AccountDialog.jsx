import { useEffect, useState } from 'react';
import { accountLink } from '../../services/socketService';
import { avatarFor } from '../../utils/avatar';

// Hesabım: ad, avatar ve "Hesabımı başka cihaza taşı" bağlantısı (arkadaşlar o cihazda da görünür)
export default function AccountDialog({ player, onClose }) {
    const link = accountLink();
    const [done, setDone] = useState('');
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
            </section>
        </div>
    );
}
