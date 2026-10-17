# CONTABLE-AGENCIAS

Sistema contable y administrativo de Agencias Corrientes.

## Stack
- Next.js 16.3.8
- React 19.2
- TypeScript
- Supabase Auth + PostgreSQL + RLS
- Vercel

## Módulos iniciales
Dashboard, plan de cuentas, contactos, ventas, compras, caja y bancos, pagos, reportes y configuración.

## Seguridad
La aplicación usa sesiones de Supabase mediante cookies, variables públicas únicamente para la URL y Publishable key, y RLS para aislar cada organización.

## Desarrollo
npm install
npm run dev

Variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

## Entornos Preview de Vercel

Cada rama de Preview que use un esquema de base de datos distinto debe tener `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configuradas en Vercel para Preview y limitadas al nombre exacto de esa rama. Deben apuntar al proyecto Supabase de prueba. No se debe permitir que una rama de Preview herede las variables generales de Producción. Al cambiar variables de entorno, hay que generar un nuevo despliegue para que surtan efecto.
