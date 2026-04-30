# Gestionale Magazzino

Applicazione Next.js per la gestione di magazzino: movimenti (entrate/uscite), inventario, referenti, import Excel, audit log.

## Setup

### Variabili d'ambiente

Crea `.env.local` con:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Per le email di chiusura (Resend):

```
RESEND_API_KEY=re_...
FROM_EMAIL=onboarding@resend.dev
```

### Migrazioni Supabase

Esegui le migration in `supabase/migrations/` tramite Supabase SQL Editor o CLI. Vedi `supabase/README_MIGRATIONS.md`.

## Struttura

- `app/` – App Router, pagine e API
- `app/_components/` – SideNav, TopBar
- `app/_lib/` – Supabase client, utils, hooks (useAuth, useIsAdmin), tipi, validazioni Zod, ToastContext
- `app/api/excel-live/download` – Export Excel inventario (solo admin)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
