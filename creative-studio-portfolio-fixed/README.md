# Zelalem.M — Website + Admin

- `public/`       the website (index.html) and the admin page (admin.html) — each is one self-contained file
- `worker.js`     the small server: login, saving content, uploads, contact messages
- `wrangler.toml` Cloudflare settings (includes the storage the admin needs)
- `src/` + `build.py`  editable sources; run `python3 build.py` to regenerate `public/` (only needed if you edit the code)
- `react-app/`    old optional React/Supabase version — not used, ignore it

## Setup (one time)

1. Put ALL these files in your GitHub repo (replace what is there) so `wrangler.toml` and `worker.js` are at the top level.
2. Cloudflare → your Worker `portfolio` → Settings → Build:
   - Build command: leave empty
   - Deploy command: `npx wrangler deploy`
3. After the deploy finishes, set your password:
   Worker → Settings → Variables and Secrets → Add → Type **Secret**,
   Name `ADMIN_PASSWORD`, Value = your password (long, not used anywhere else).
   Add a second **Secret**: Name `ADMIN_EMAIL`, Value = your admin email. Only this email + password can sign in. → Deploy.
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

Videos: paste a YouTube/Vimeo link (best for long films) or upload an MP4 (max 24 MB). They show inside the Work page (filter: Video) and on the home page; clicking one opens a player.
When you are signed in to /admin, an Admin button and bar appear on your public site. Visitors never see them.

## If you host on Cloudflare **Pages** (not a Worker)
`public/_worker.js` is a copy of `worker.js` so Pages runs it too. Set: Build command empty, Build output directory `public`.
Then Pages project → Settings → Bindings → add **KV namespace**, variable name `CONTENT` (create a KV namespace first);
Settings → Variables and Secrets → add `ADMIN_PASSWORD` and `ADMIN_EMAIL`. Redeploy.
Check: `https://YOUR-SITE/api/session` must show JSON, not a 404 page.
