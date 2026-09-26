# Diego Bakery Desktop V1

Versión de escritorio para Windows de la misma V1 de Diego Bakery.

## Desarrollo local

1. Construye la app web:
   npm --prefix app install
   npm --prefix app run build
2. Instala dependencias de escritorio:
   npm --prefix desktop install
3. Ejecuta:
   npm --prefix desktop start

## Generar Windows

Desde la raíz:

npm --prefix app run build
npm --prefix desktop install
npm --prefix desktop run dist:win

Se generan un instalador NSIS y una versión portable dentro de desktop/dist.
