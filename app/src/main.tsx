import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontró el contenedor raíz de Diego Bakery.');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Android y Windows cargan esta interfaz directamente desde sus propios
// archivos empaquetados. Railway se usa para API, sincronización e IA,
// nunca para reemplazar la interfaz nativa.