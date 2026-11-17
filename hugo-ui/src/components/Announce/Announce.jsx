import { useEffect, useState } from 'react';

// Yönetici duyurusu (server:announce): ekranın üstünde 8 sn görünür, dokununca kapanır
export default function Announce() {
    const [text, setText] = useState('');
    useEffect(() => {
        let timer;
        const on = (e) => { setText(e.detail?.text || ''); clearTimeout(timer); timer = setTimeout(() => setText(''), 8000); };
        window.addEventListener('hugo:announce', on);
        return () => { window.removeEventListener('hugo:announce', on); clearTimeout(timer); };
    }, []);
    if (!text) return null;
    return <div className="announce" role="status" onClick={() => setText('')}>{text}</div>;
}
