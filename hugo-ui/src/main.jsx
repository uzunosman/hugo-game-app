import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import DesignSwitcher from './components/DesignSwitcher/DesignSwitcher.jsx'

// Sağ altta küçük sürüm etiketi: test edilen sürüm buradan doğrulanır (deploy/update.sh verir)
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <DesignSwitcher />
    <div className="app-version" aria-hidden="true">{VERSION}</div>
  </StrictMode>,
)

// Ana ekrana eklenen uygulama eski sürümde kalmasın: uygulamaya dönülünce yayındaki sayfanın kod dosyası
// açık olandan farklıysa sayfa yenilenir (oyun durumu sunucuda; yenileyince masaya geri dönülür)
if (import.meta.env.PROD) {
  const current = () => document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  const check = async () => {
    if (document.visibilityState !== 'visible' || document.querySelector('.game-board.is-dragging')) return;
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text();
      const live = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
      if (!live || !current() || live === current()) return;
      // Aynı yeni sürüm için bir kez yenile (önbellek eskiyi verirse döngüye girmesin)
      try { if (sessionStorage.getItem('hugo-reloaded-for') === live) return; sessionStorage.setItem('hugo-reloaded-for', live); } catch { /* özel pencere */ }
      location.replace(`/?v=${Date.now()}`); // yeni adres: telefon önbelleğindeki eski sayfa kullanılamaz
    } catch { /* çevrimdışı: sonra yeniden denenir */ }
  };
  // Uygulamaya dönünce ve sunucu yeniden başlayıp bağlantı geri gelince (güncelleme) kontrol edilir
  document.addEventListener('visibilitychange', check);
  window.addEventListener('hugo:reconnected', check);
  check(); // açılışta da: ana ekran uygulaması eski sayfayla açıldıysa güncel sürüme geçer
}

// Teşhis (iPhone ana ekran uygulamasındaki donma için): hatalar ve ana iş parçacığının uzun süre kilitlenmesi
// sunucu günlüğüne gider. Son kullanıcı hareketi (window.__lastAction) donmanın neyle başladığını gösterir.
{
  const ctx = () => ({
    v: VERSION, standalone: !!(navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches),
    vp: `${innerWidth}x${innerHeight}`, ua: navigator.userAgent.slice(0, 160), last: window.__lastAction,
  });
  const send = (data) => import('./services/socketService.js').then(m => m.default.log({ ...ctx(), ...data }));
  window.addEventListener('error', (e) => send({ type: 'error', msg: e.message, at: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error?.stack?.slice(0, 600) }));
  window.addEventListener('unhandledrejection', (e) => send({ type: 'rejection', msg: String(e.reason?.message || e.reason), stack: e.reason?.stack?.slice(0, 600) }));
  let tick = Date.now();
  setInterval(() => {
    const gap = Date.now() - tick;
    if (gap > 2500 && document.visibilityState === 'visible') send({ type: 'donma', ms: gap });
    tick = Date.now();
  }, 1000);
  document.addEventListener('visibilitychange', () => { tick = Date.now(); });
  window.__hugoLog = send;
}
