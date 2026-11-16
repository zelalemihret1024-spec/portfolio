# Zelalem.M — Creative Studio Website

Static site, no build step. The deployable folder is `public/`.

## Deploy to Cloudflare Pages (easiest, no tools)
1. Go to dash.cloudflare.com → Workers & Pages → Create → Pages → **Upload assets**.
2. Name the project `zelalem-m`, drag in the **contents of the `public/` folder** (or the zip), click Deploy.
3. Your site is live at `https://zelalem-m.pages.dev`.

## Deploy with Git (auto-deploys)
Push this folder to GitHub → Cloudflare Pages → Connect to Git →
Framework preset: **None**, Build command: *(empty)*, Output directory: `public`.

## Deploy with Wrangler CLI
```
npx wrangler deploy
```
(uses `wrangler.toml`, serving `./public`)

## Optional: React + Supabase version (admin dashboard)
`react-app/` holds the original React source with admin login/uploads. To use it:
```
cd react-app && npm install && npm run build
```
Cloudflare Pages: Root directory `react-app`, Build command `npm run build`, Output `dist`.
Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL` (see `.env.example`) and run `supabase/schema.sql`.
