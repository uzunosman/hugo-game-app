import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import DesignSwitcher from './components/DesignSwitcher/DesignSwitcher.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <DesignSwitcher />
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
      if (live && current() && live !== current()) location.reload();
    } catch { /* çevrimdışı: sonra yeniden denenir */ }
  };
  document.addEventListener('visibilitychange', check); // yalnızca uygulamaya dönünce: oyun ortasında kendiliğinden yenilenmez
}
