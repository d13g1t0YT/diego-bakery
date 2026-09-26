-- Diego Bakery Database Schema
-- Spanish-ready business management system

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Usuarios/Administradores
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  apellido VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  apellido VARCHAR(255),
  telefono VARCHAR(20),
  direccion TEXT,
  referencia TEXT,
  puntos_lealtad INTEGER DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Productos
CREATE TABLE IF NOT EXISTS productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL UNIQUE,
  descripcion TEXT,
  precio_venta DECIMAL(10,2) NOT NULL CHECK (precio_venta > 0),
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredientes
CREATE TABLE IF NOT EXISTS ingredientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL UNIQUE,
  unidad_medida VARCHAR(50) NOT NULL,
  costo_unitario DECIMAL(10,4) NOT NULL CHECK (costo_unitario >= 0),
  cantidad_en_stock DECIMAL(10,2) DEFAULT 0 CHECK (cantidad_en_stock >= 0),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recetas
CREATE TABLE IF NOT EXISTS recetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES productos(id),
  nombre VARCHAR(255) NOT NULL,
  costo_ingredientes DECIMAL(10,2),
  costo_utilidades DECIMAL(10,2),
  costo_mano_obra DECIMAL(10,2),
  precio_venta DECIMAL(10,2),
  ganancia DECIMAL(10,2),
  margen_porcentaje DECIMAL(5,2),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredientes en Receta
CREATE TABLE IF NOT EXISTS receta_ingredientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receta_id UUID NOT NULL REFERENCES recetas(id),
  ingrediente_id UUID NOT NULL REFERENCES ingredientes(id),
  cantidad DECIMAL(10,2) NOT NULL CHECK (cantidad > 0),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Órdenes/Pedidos
CREATE TABLE IF NOT EXISTS ordenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id),
  estado VARCHAR(50) NOT NULL,
  fecha_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_entrega TIMESTAMP,
  notas TEXT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Productos en Orden
CREATE TABLE IF NOT EXISTS orden_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL REFERENCES ordenes(id),
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(10,2),
  subtotal DECIMAL(10,2),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Movimientos de Inventario
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingrediente_id UUID NOT NULL REFERENCES ingredientes(id),
  tipo VARCHAR(50) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL CHECK (cantidad > 0),
  razon TEXT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Métodos de Pago
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL REFERENCES ordenes(id),
  metodo VARCHAR(50) NOT NULL,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  referencia_transaccion VARCHAR(255),
  comprobante_url VARCHAR(500),
  confirmado_por UUID REFERENCES usuarios(id),
  confirmado_en TIMESTAMP,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Promociones/Cupones
CREATE TABLE IF NOT EXISTS promociones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  descuento_porcentaje DECIMAL(5,2),
  descuento_monto DECIMAL(10,2),
  activo BOOLEAN DEFAULT true,
  fecha_inicio TIMESTAMP,
  fecha_fin TIMESTAMP,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Finanzas/Gastos
CREATE TABLE IF NOT EXISTS gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria VARCHAR(100),
  descripcion TEXT NOT NULL,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inversiones/Capital
CREATE TABLE IF NOT EXISTS inversiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion TEXT NOT NULL,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deudas (cobrar/pagar)
CREATE TABLE IF NOT EXISTS deudas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id),
  tipo VARCHAR(50) NOT NULL,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  descripcion TEXT,
  pagado BOOLEAN DEFAULT false,
  fecha_vencimiento TIMESTAMP,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pérdidas/Desperdicios
CREATE TABLE IF NOT EXISTS perdidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingrediente_id UUID REFERENCES ingredientes(id),
  producto_id UUID REFERENCES productos(id),
  cantidad DECIMAL(10,2),
  razon TEXT,
  valor_perdido DECIMAL(10,2),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sincronización (para offline-first)
CREATE TABLE IF NOT EXISTS sincronizacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla_nombre VARCHAR(100),
  registro_id UUID,
  operacion VARCHAR(50),
  datos_antes JSONB,
  datos_despues JSONB,
  sincronizado BOOLEAN DEFAULT false,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sincronizado_en TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON ordenes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
CREATE INDEX IF NOT EXISTS idx_ingredientes_stock ON ingredientes(cantidad_en_stock);
CREATE INDEX IF NOT EXISTS idx_movimientos_ingrediente ON movimientos_inventario(ingrediente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_orden ON pagos(orden_id);


-- Backups cifrados a nivel de base de datos (contenido JSON del estado del negocio)
CREATE TABLE IF NOT EXISTS copias_seguridad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  contenido JSONB NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_copias_usuario_fecha
  ON copias_seguridad(usuario_id, creado_en DESC);
CREATE TABLE IF NOT EXISTS estados_negocio (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido JSONB NOT NULL,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pedidos_publicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_ref VARCHAR(120) UNIQUE,
  cliente_nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  direccion TEXT,
  notas TEXT,
  items JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
  descuento DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
  estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pedidos_publicos_estado
  ON pedidos_publicos(estado);
