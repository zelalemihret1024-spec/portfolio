# Zelalem.M — Website + Admin

- `public/`       the website (index.html, app.js, shared.js) and the admin page (admin.html)
- `worker.js`     the small server: login, saving content, uploads, contact messages
- `wrangler.toml` Cloudflare settings (includes the storage the admin needs)
- `react-app/`    old optional React/Supabase version — not used, ignore it

## Setup (one time)

1. Put ALL these files in your GitHub repo (replace what is there) so `wrangler.toml` and `worker.js` are at the top level.
2. Cloudflare → your Worker `portfolio` → Settings → Build:
   - Build command: leave empty
   - Deploy command: `npx wrangler deploy`
3. After the deploy finishes, set your password:
   Worker → Settings → Variables and Secrets → Add → Type **Secret**,
   Name `ADMIN_PASSWORD`, Value = your password (long, not used anywhere else) → Deploy.
4. Open `https://YOUR-SITE/admin` and sign in.

If the first deploy complains about the `CONTENT` KV namespace:
Cloudflare → Storage & Databases → KV → Create namespace `zelalem-content`, copy its ID, and in `wrangler.toml` change
```
[[kv_namespaces]]
binding = "CONTENT"
id = "PASTE-THE-ID-HERE"
```

## Using the admin
Projects, Videos, Services: add, edit, hide/show, reorder (↑ ↓), delete.
Site text: every heading, paragraph, photo, email and phone.
Menu & more: choose which pages show in the menu.
Messages: enquiries from the contact form. Uploads: manage your files.
Always click **Save changes** — the website updates immediately.

Videos: paste a YouTube/Vimeo link (best for long films) or upload an MP4 (max 24 MB).
