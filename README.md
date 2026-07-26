# BBCal

BBCal is a full-screen visual calendar planner with multi-day and half-day
events. Calendar data and editable categories are stored in Supabase.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Next.js.

## Production build

```bash
npm run build
```

The static site is exported to `out/`.

## Publishing

Pushes to `main` are automatically built and published to GitHub Pages by
`.github/workflows/deploy-pages.yml`.
