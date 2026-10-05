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
