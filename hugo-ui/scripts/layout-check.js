// Yerleşim çakışma kontrolü: oyun ekranındayken tarayıcı konsoluna yapıştırıp `layoutCheck()` çalıştır.
// Telefon ölçüleri için DevTools cihaz kipinde (örn. 844×390, 667×375) dene. Taşlar, perler, köşe alanları,
// oyuncu kartları ve butonlar birbirine biniyor ya da ekran dışına taşıyorsa listeler.
function layoutCheck(doc = document, win = window) {
    const groups = {
        rack: '.tile-holder .tile', set: '.open-set-tile', zone: '.tile-drop-zone', center: '.center-tile',
        panel: '.player-panel', action: '.action-buttons button', tools: '.rack-tool-btn',
        top: '.settings-toggle,.chat-toggle,.pl-toggle,.round-chip,.scoreboard-toggle',
    };
    const items = [];
    for (const [g, sel] of Object.entries(groups)) {
        doc.querySelectorAll(sel).forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width && r.height) items.push({ g, el, r, label: `${g}:${(el.textContent || '').trim().slice(0, 12)}` });
        });
    }
    const problems = [];
    items.forEach(a => {
        if (a.r.left < -1 || a.r.top < -1 || a.r.right > win.innerWidth + 1 || a.r.bottom > win.innerHeight + 1) problems.push(`ekran dışı ${a.label}`);
    });
    const hit = (a, b) => a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1;
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const [a, b] = [items[i], items[j]];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue; // iç içe (köşe alanındaki taş gibi)
            if (hit(a, b)) problems.push(`çakışma ${a.label} <> ${b.label}`);
        }
    }
    console.log(`${win.innerWidth}×${win.innerHeight}: ${items.length} öğe, ${problems.length} sorun`, problems);
    return problems;
}
