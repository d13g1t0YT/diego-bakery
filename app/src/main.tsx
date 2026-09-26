import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import './styles.css';

const REMOTE_APP = 'https://diego-bakery-api-clean-production.up.railway.app/app/';
const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontró el contenedor raíz de Diego Bakery.');
}

function renderApp() {
  createRoot(root as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

async function remoteAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch(REMOTE_APP + '?health=' + Date.now(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      redirect: 'follow'
    });
    window.clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function boot() {
  const native = Capacitor.isNativePlatform();
  const remoteOrigin = new URL(REMOTE_APP).origin;
  const alreadyRemote = window.location.origin === remoteOrigin;

  if (native && !alreadyRemote) {
    if (await remoteAvailable()) {
      window.location.replace(REMOTE_APP);
      return;
    }
  }

  renderApp();
}

void boot();

if ('serviceWorker' in navigator && window.location.pathname.startsWith('/app/')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}
