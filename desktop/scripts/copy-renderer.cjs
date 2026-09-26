const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', '..', 'app', 'dist');
const destination = path.resolve(__dirname, '..', 'renderer');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error('No existe app/dist/index.html. Ejecuta primero: npm --prefix app run build');
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log('Renderer copiado a desktop/renderer');
