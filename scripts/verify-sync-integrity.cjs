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
  ['remote URL exists', main.includes('https://diego-bakery-api-clean-production.up.railway.app/app/')],
  ['native redirect is guarded', main.includes('if (native && !alreadyRemote)') && main.includes('if (await remoteAvailable())') && main.includes('window.location.replace(REMOTE_APP)')],
  ['no recursive loader import', !main.includes("import('./local-loader.js")],
  ['index loads main directly', index.includes('src="./src/main.tsx"') || index.includes('src="/src/main.tsx"')],
  ['service worker cache v6', sw.includes('diego-bakery-v6')],
  ['cloud API exists', api.includes("'/api/estado'")],
  ['AI API exists', api.includes("'/api/ia/asesor'")],
  ['save effect does not rewrite local change time', !app.includes('saveState({ ...state, lastLocalChangeAt: new Date().toISOString() })')],
  ['stateRef is updated synchronously', app.includes('stateRef.current = next;')],
  ['unsynced local state is pushed first', app.includes('const localIsUnsynced') && app.includes('await putCloudState(token, local);')],
  ['old merge assignment is gone', !app.includes('const merged = localIsNewer ? mergeStatePreservingLocal(local, remoteState) : mergeStateFromCloud(local, remoteState)')],
  ['old merge function declarations are gone', !app.includes('function mergeStateFromCloud') && !app.includes('function mergeStatePreservingLocal')],
  ['background refresh is five seconds', app.includes('}, 5000);')],
];

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