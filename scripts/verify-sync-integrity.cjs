const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const app = read('app/src/App.tsx');
const main = read('app/src/main.tsx');
const index = read('app/index.html');
const sw = read('app/public/sw.js');
const api = read('app/src/api.ts');

const checks = [
  ['frontend has central remote URL', main.includes('https://diego-bakery-api-clean-production.up.railway.app/app/')],
  ['native startup redirects only when remote is available', main.includes('window.location.replace(REMOTE_APP)')],
  ['main bundle has no recursive local-loader import', !main.includes("import('./local-loader.js")],
  ['index loads Vite entry directly', index.includes('src="/src/main.tsx"') || index.includes('src="./src/main.tsx"')],
  ['service worker uses v6 cache', sw.includes("diego-bakery-v6")],
  ['client exposes cloud state API', api.includes("'/api/estado'")],
  ['client exposes AI API', api.includes("'/api/ia/asesor'")],
  ['local save does not rewrite change timestamp on every render', !app.includes('saveState({ ...state, lastLocalChangeAt: new Date().toISOString() })')],
  ['updateState updates stateRef synchronously', app.includes('stateRef.current = next;')],
  ['refresh pushes unsynced local state before pulling remote', app.includes('await putCloudState(token, local);') && app.includes('const localIsUnsynced')],
  ['refresh replaces collections from cloud instead of re-merging deletions', !app.includes('const merged = localIsNewer ? mergeStatePreservingLocal(local, remoteState) : mergeStateFromCloud(local, remoteState)')],
  ['legacy merge helpers are no longer used', !app.includes('mergeStatePreservingLocal(') && !app.includes('mergeStateFromCloud(')],
  ['background refresh is 5 seconds', app.includes('}, 5000);')
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) failed++;
}
if (failed) {
  console.error(failed + ' sync integrity checks failed.');
  process.exit(1);
}
console.log('All sync integrity checks passed.');
