import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import './styles.css';

const REMOTE_LOADER = 'https://diego-bakery-api-clean-production.up.railway.app/app/remote-loader.js';

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

async function bootNativeOrLocal() {
  const native = Capacitor.isNativePlatform();
  const remoteAttempted = sessionStorage.getItem('diego-bakery-remote-attempted') === '1';

  if (native && !remoteAttempted) {
    sessionStorage.setItem('diego-bakery-remote-attempted', '1');
    try {
      await import(REMOTE_LOADER + '?v=' + Date.now());
      return;
    } catch (error) {
      console.warn('Diego Bakery: versión remota no disponible; usando versión local.', error);
    }
  }

  sessionStorage.removeItem('diego-bakery-remote-attempted');
  renderApp();
}

if ('serviceWorker' in navigator && location.pathname.startsWith('/app/')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}

void bootNativeOrLocal();
