const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const app = read('app/src/App.tsx');
const main = read('app/src/main.tsx');
const index = read('app/index.html');
const sw = read('app/public/sw.js');
const api = read('app/src/api.ts');

const checks = [];
checks.push(['remote URL exists', main.includes('https://diego-bakery-api-clean-production.up.railway.app/app/')]);
checks.push(['native redirect is guarded', main.includes('if(e&&!n&&await Bt()){window.location.replace(Lt);return}')] || main.includes('window.location.replace(REMOTE_APP)'));
checks.push(['no recursive loader import', !main.includes("import('./local-loader.js")]);
checks.push(['index loads main directly', index.includes('src="./src/main.tsx"') || index.includes('src="/src/main.tsx"')]);
checks.push(['service worker cache v6', sw.includes("diego-bakery-v6")]);
checks.push(['cloud API exists', api.includes("'/api/estado'")]);
checks.push(['AI API exists', api.includes("'/api/ia/asesor'")]);
checks.push(['save effect does not rewrite local change time', !app.includes('saveState({ ...state, lastLocalChangeAt: new Date().toISOString() })')]);
checks.push(['stateRef is updated before state', app.includes('stateRef.current = next;')]);
checks.push(['unsynced local state is pushed first', app.includes('await putCloudState(token, local);') && app.includes('const localIsUnsynced')]);
checks.push(['old merge assignment is gone', !app.includes('const merged = localIsNewer ? mergeStatePreservingLocal(local, remoteState) : mergeStateFromCloud(local, remoteState)')]);
checks.push(['old merge helpers are unused', !app.includes('mergeStatePreservingLocal(') && !app.includes('mergeStateFromCloud(')]);
checks.push(['background refresh is five seconds', app.includes('}, 5000);')]);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed > 0) {
  console.error(`${failed} sync integrity checks failed.`);
  process.exit(1);
}
console.log('All sync integrity checks passed.');