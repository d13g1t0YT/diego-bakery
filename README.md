# Diego Bakery API

Sistema de gestión empresarial offline-first para panaderías. API REST con soporte para:

- **Administración**: Autenticación con PIN/teléfono, biométrica lista
- **Productos & Recetas**: Gestión con cálculo automático de costos y márgenes
- **Pedidos**: Workflow completo de estados
- **Inventario**: Movimientos y control de stock
- **Finanzas**: Gastos, ingresos, deudas, inversiones
- **Clientes & Lealtad**: Gestión con puntos de lealtad
- **Sincronización**: Preparado para offline-first con sync API

## Instalación local

```bash
npm install
npm run dev
```

## Configuración

Crear `.env` basado en `.env.example`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/diego_bakery
PORT=3000
JWT_SECRET=your-secret-key
ADMIN_PIN=0000
```

## Base de datos

```bash
npm run db:migrate
```

## Estructura

- `/src/db` - Conexión y esquema
- `/src/middleware` - Autenticación JWT
- `/src/routes` - Endpoints de API
- `/src/index.ts` - Servidor Express

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Login con PIN
- `GET /api/auth/verify` - Verificar token

### Productos
- `GET /api/productos` - Listar
- `POST /api/productos` - Crear
- `PUT /api/productos/:id` - Actualizar
- `DELETE /api/productos/:id` - Eliminar

### Órdenes
- `GET /api/ordenes` - Listar
- `POST /api/ordenes` - Crear
- `PUT /api/ordenes/:id` - Actualizar estado

## Estado del proyecto

MVP listo para:
- [ ] Configurar cliente Android (Kotlin/Compose)
- [ ] Implementar sync API completa (pendientes, confirmados, etc.)
- [ ] Agregar endpoints de recetas, ingredientes, finanzas
- [ ] Integración Yape/Plin
- [ ] Generación de reportes (PDF/CSV)

