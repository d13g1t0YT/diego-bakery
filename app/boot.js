const root = document.getElementById('root');

function showBootError() {
  if (!root) return;
  root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui;background:#faf7f2;color:#30221c"><div style="max-width:520px;text-align:center;background:#fffdf9;border:1px solid #e8ddd2;border-radius:24px;padding:28px"><strong style="font-size:24px;display:block;margin-bottom:10px">Diego Bakery</strong><p>No se pudo iniciar la interfaz. Recarga la página para intentarlo de nuevo.</p><button onclick="location.reload()" style="border:0;border-radius:12px;background:#7a412d;color:#fff;padding:12px 18px;cursor:pointer">Recargar</button></div></div>';
}

async function boot() {
  try {
    await import('./local-loader.js?v=' + Date.now());
  } catch (error) {
    console.error('Diego Bakery boot error', error);
    showBootError();
  }
}

void boot();
