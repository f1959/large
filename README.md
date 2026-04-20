# Private File Relay (Supabase Edge Function)

Minimal private web app for this exact relay path:

`External file URL -> Supabase Edge Function -> your browser`

## Why this stack

- **Frontend:** plain static HTML/CSS/JS (minimal UI)
- **Auth:** Supabase Auth (single user: `admin@f1959.com`)
- **Relay backend:** Supabase Edge Function with authenticated stream relay

### Why Supabase Storage is not used

This design intentionally avoids Supabase Storage in the relay path so files are not persisted as application data. The Edge Function fetches upstream and streams the response body through immediately.

### Why Edge Function streaming is used

The Edge Function is the authenticated choke point where we can:
- require a valid JWT
- verify user email is exactly `admin@f1959.com`
- validate URL input and protocol
- set basic timeout and relay headers

## Honest limitations on Supabase Free

This setup is for **experimentation/feedback first**, not robust large-scale transfer infrastructure:

- Long-running or very large file relays can fail due to function/runtime limits.
- Slow upstream servers may hit timeout/runtime ceilings.
- Browser-side download handling may still use memory depending on browser behavior.
- No resumable-download logic is implemented.

## Project structure

```
.
├── index.html
├── styles.css
├── app.js
├── config.example.js
├── supabase/
│   ├── config.toml
│   └── functions/
│       └── relay/
│           └── index.ts
└── README.md
```

## Environment variables

### Frontend (`config.js`)
Copy `config.example.js` to `config.js` and fill:

- `window.__SUPABASE_URL__` = `https://<project-ref>.supabase.co`
- `window.__SUPABASE_ANON_KEY__` = your Supabase anon key

### Edge Function secrets
Set function secrets in Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

> No password is stored in code.

## Setup steps

1. Create a Supabase project.
2. In `Authentication -> Settings`, keep email/password auth enabled.
3. Copy `config.example.js` to `config.js` and insert project URL + anon key.
4. Configure `supabase/config.toml` project id.
5. Deploy the edge function (see deployment section).
6. Host static files (`index.html`, `styles.css`, `app.js`, `config.js`) on any private static host.

## Exact steps: manually create `admin@f1959.com` in Supabase Auth

1. Open Supabase dashboard.
2. Go to **Authentication -> Users**.
3. Click **Add user**.
4. Enter email: `admin@f1959.com`.
5. Set password manually.
6. Ensure user is confirmed/active (if confirmation is required in your project settings).
7. Do **not** create other production users for this private app.

## Deploy instructions

### Deploy Edge Function

Install and login to Supabase CLI, then from project root:

```bash
supabase functions deploy relay
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
supabase secrets set SUPABASE_ANON_KEY=<your-anon-key>
```

`verify_jwt = true` is set in `supabase/config.toml` for `relay`.

### Deploy static frontend

Deploy these files to a static host:
- `index.html`
- `styles.css`
- `app.js`
- `config.js`

Examples: Cloudflare Pages, Netlify, Vercel static, GitHub Pages (if private access is handled externally).

## UX behavior

- First load:
  - no session => password-only login screen
  - valid session for admin => URL + Download + Logout
- Login uses fixed email `admin@f1959.com` and typed password only.
- Download posts URL to authenticated relay function.
- Logout signs out and returns to password-only screen.

## Security notes

Current protections:
- JWT required at relay endpoint.
- User validated via Supabase Auth inside function.
- Only `admin@f1959.com` allowed.
- URL required, parsed, and restricted to `http/https`.
- Upstream timeout enforced.

Future hardening to add (commented in code):
- strict allowlist/blocklist for hostnames/IP ranges (SSRF hardening)
- optional size limits/content-type restrictions

## Likely failure cases under Supabase Free

- Large files may fail mid-transfer.
- Slow upstream sources may time out.
- Edge runtime constraints can terminate prolonged streams.
- Some upstream servers may block relay traffic, return anti-bot pages, or require custom headers.
