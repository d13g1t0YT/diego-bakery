# Diego Bakery

Sistema de gestión para un negocio de repostería artesanal, con una aplicación React + Vite + Capacitor y una API REST Node.js + Express.

## Arquitectura actual

- **App**: React 19 + Vite + Capacitor 8.
- **Persistencia local**: IndexedDB con respaldo alternativo en localStorage.
- **API**: Node.js 20 + TypeScript + Express.
- **Base de datos**: PostgreSQL.
- **Autenticación**: teléfono + PIN con JWT; biometría preparada en la app nativa.
- **Modo offline-first**: la operación local puede continuar sin conexión y sincronizar cuando vuelve Internet.
- **Pedidos públicos**: los clientes pueden enviar pedidos sin iniciar sesión.
- **Negocio**: productos, recetas/costos, ingredientes, proveedores, clientes, pedidos, caja, finanzas, deudas, pérdidas, promociones, combos, lealtad, avisos y reportes.
- **Notificaciones**: avisos locales en dispositivos compatibles.

## API

### Autenticación
- `POST /api/auth/login`
- `GET /api/auth/verify`

### Productos
- `GET /api/productos`
- `POST /api/productos`
- `PUT /api/productos/:id`
- `DELETE /api/productos/:id`

### Pedidos
- `GET /api/ordenes`
- `POST /api/ordenes`
- `PUT /api/ordenes/:id`

### Sincronización y respaldos
- `GET /api/estado`
- `PUT /api/estado`
- `POST /api/backup`

### Pedidos públicos
- `POST /api/pedidos-publicos`
- `GET /api/pedidos-publicos`
- `PUT /api/pedidos-publicos/:id`

## Instalación del backend

```bash
npm install
npm run db:migrate
npm run dev
```

Crear `.env` desde `.env.example`.

### Variables

```text
DATABASE_URL=postgresql://user:password@localhost:5432/diego_bakery
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key
ADMIN_PHONE=999999999
ADMIN_PIN=0000
ADMIN_NAME=Administrador
ADMIN_LASTNAME=Diego Bakery
```

`ADMIN_PHONE` + `ADMIN_PIN` son opcionales: cuando están definidos, el backend puede crear automáticamente el administrador inicial si ese teléfono todavía no existe. En producción se deben usar valores privados y fuertes; no se deben subir secretos reales al repositorio.

## Instalación de la app

```bash
cd app
npm install
npm run dev
```

Para Android:

```bash
npm run build
npx cap sync android
```

La URL de la API de producción se configura mediante `app/.env.production` con `VITE_API_URL`.

## Calidad y despliegue

El proyecto incluye un workflow de GitHub Actions que comprueba por separado el build del backend y el build de la app antes de considerar válido un cambio.

Railway aloja actualmente la API y PostgreSQL. El servicio principal de API está configurado con `/health` como healthcheck.

## Próxima etapa del producto

La base funcional ya está conectada. La siguiente etapa se centra en endurecer la sincronización offline-first, completar la persistencia de módulos empresariales en PostgreSQL, mejorar la experiencia de cliente y administración, y preparar el paquete Android de producción.
