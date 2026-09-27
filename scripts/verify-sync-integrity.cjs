const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const app = read('app/src/App.tsx');
const main = read('app/src/main.tsx');
const index = read('app/index.html');
const sw = read('app/public/sw.js');
const api = read('app/src/api.ts');
const desktop = read('desktop/main.cjs');
const types = read('app/src/types.ts');
const deepEditor = read('app/src/DeepEditor.tsx');
const recipeImport = read('app/src/RecipeImportPanel.tsx');
const recipeRoute = read('src/routes/recetas.ts');

const checks = [
  ['native app does not redirect to web', !main.includes('window.location.replace') && !main.includes('REMOTE_APP')],
  ['native app renders bundled frontend', main.includes('createRoot(root).render')],
  ['desktop loads bundled renderer', desktop.includes('win.loadFile(rendererPath)') && !desktop.includes('win.loadURL(')],
  ['desktop does not contain remote app URL', !desktop.includes('/app/') && !desktop.includes('REMOTE_URL')],
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
  ['API request has a bounded timeout', api.includes('REQUEST_TIMEOUT_MS')],
  ['recipe unit conversion exists', types.includes('function convertQuantity') && types.includes('line.unit')],
  ['visual recipe import exists', recipeRoute.includes('input_image') && recipeRoute.includes('.png') && recipeRoute.includes('.jpg')],
  ['recipe UI accepts images', recipeImport.includes('.png') && recipeImport.includes('.jpg')],
  ['deep editor autosaves drafts', deepEditor.includes('function commitDraft') && deepEditor.includes('Guardado y recalculado automáticamente')],
  ['AI product advisor exposes specifications', api.includes('bakingTimeMinutes') && api.includes('specifications')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} integrity checks failed.`);
  process.exit(1);
}

console.log('All integrity checks passed.');