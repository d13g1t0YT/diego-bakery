const fs = require('node:fs');
const path = require('node:path');

const dist = path.resolve(process.cwd(), 'dist');

function readManifest() {
  const candidates = [
    path.join(dist, '.vite', 'manifest.json'),
    path.join(dist, 'manifest.json')
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }

  throw new Error('No se encontró el manifiesto de Vite.');
}

function findEntry(manifest) {
  const match = Object.entries(manifest).find(([, value]) =>
    value &&
    typeof value === 'object' &&
    value.isEntry &&
    /(^|\/)src\/main\.(t|j)sx?$/.test(String(value.src || ''))
  );

  if (!match) {
    throw new Error('No se encontró src/main.tsx como entrada de Vite.');
  }

  return match[1].file;
}

const entryFile = findEntry(readManifest());
const loader = [
  '// Archivo generado automáticamente. No editar.',
  "import './" + entryFile + "';",
  ''
].join('\n');

fs.writeFileSync(path.join(dist, 'local-loader.js'), loader);
fs.writeFileSync(path.join(dist, 'remote-loader.js'), loader);
fs.writeFileSync(
  path.join(dist, 'live-version.json'),
  JSON.stringify({
    entry: entryFile,
    generatedAt: new Date().toISOString()
  }, null, 2) + '\n'
);

console.log('Diego Bakery live build preparado: ' + entryFile);
