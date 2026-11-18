// Bağlantı paylaş: telefonda paylaşım menüsü (WhatsApp vb.), yoksa panoya kopyala. Sonuç: 'shared' | 'copied' | 'cancel' | 'failed'
export const shareLink = async ({ title, text, url }) => {
    if (navigator.share) {
        try { await navigator.share({ title, text, url }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
    }
    try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
};
