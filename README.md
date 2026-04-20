# Private File Relay (Beginner-Friendly Guide)

This is a very small private web app.
It relays file downloads like this:

**External URL -> Supabase Edge Function -> Your browser**

You log in with **one account only**:
- `admin@f1959.com`

No password is stored in code.

---

## 1) What this app does (plain English)

After login, you paste a file URL (example: `https://example.com/file.zip`) and click **Download**.

The app does this:
1. Sends your URL to your Supabase Edge Function.
2. Edge Function checks you are authenticated.
3. Edge Function confirms your user email is exactly `admin@f1959.com`.
4. Edge Function fetches the file and streams it back to your browser.

It does **not** use Supabase Storage for this relay path.
It does **not** permanently store files.

---

## 2) Important limits (Supabase Free plan)

Please be aware:
- Large files can fail.
- Very slow websites can time out.
- Long transfers may stop due to Edge runtime limits.

So this setup is for **private testing and feedback first**, not guaranteed for huge files.

---

## 3) Project files

- `index.html` – page structure
- `styles.css` – minimal styling
- `app.js` – login/session/download logic
- `config.example.js` – template for frontend keys
- `supabase/functions/relay/index.ts` – secure relay function
- `supabase/config.toml` – function config (`verify_jwt = true`)

---

## 4) Prerequisites

You need:
1. A Supabase account
2. A Supabase project
3. Supabase CLI installed on your computer

Install Supabase CLI (official docs):
- https://supabase.com/docs/guides/cli

---

## 5) Step-by-step setup (very explicit)

## Step A — Create Supabase project

1. Go to https://supabase.com/dashboard
2. Click **New project**
3. Wait until the project is fully ready

---

## Step B — Manually create your admin user

You asked to create this manually in Supabase Auth.

1. In Supabase dashboard, open your project
2. Go to **Authentication -> Users**
3. Click **Add user**
4. Enter email: `admin@f1959.com`
5. Enter your password (choose and remember it)
6. Save user
7. Make sure this user is confirmed/active

Do not add signup flow in the app.

---

## Step C — Get project URL and anon key

In Supabase dashboard:
1. Go to **Project Settings -> API**
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public key**

---

## Step D — Create local frontend config file

In this project folder:

1. Copy `config.example.js` to `config.js`
2. Edit `config.js` and paste your real values

Example:

```js
window.__SUPABASE_URL__ = "https://YOUR_PROJECT_REF.supabase.co";
window.__SUPABASE_ANON_KEY__ = "YOUR_SUPABASE_ANON_KEY";
```

`config.js` is ignored by git (`.gitignore`) so your key is not committed.

---

## Step E — Set your project id in Supabase config

Open `supabase/config.toml` and replace:

```toml
project_id = "your-project-ref"
```

with your real project ref (the part before `.supabase.co`).

Example:
- URL: `https://abcxyz123.supabase.co`
- project ref: `abcxyz123`

---

## Step F — Login Supabase CLI

Run in terminal:

```bash
supabase login
```

It will open browser auth.

---

## Step G — Deploy the Edge Function

From this project root folder, run:

```bash
supabase functions deploy relay
```

Then set function secrets:

```bash
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Why secrets?
- The function needs these env vars server-side.

---

## Step H — Host the static frontend files

Host these files on any static host:
- `index.html`
- `styles.css`
- `app.js`
- `config.js`

Simple options:
- Netlify
- Vercel (static)
- Cloudflare Pages
- Any basic web server

---

## 6) How to use the app

1. Open your deployed frontend URL
2. You will see password-only login screen
   - fixed email: `admin@f1959.com`
3. Type password and click **Login**
4. Paste file URL (must start with `http://` or `https://`)
5. Click **Download**
6. Click **Logout** when done

After logout, you return to password-only screen.

---

## 7) Security behavior included

The relay function currently enforces:
- valid bearer token required
- Supabase user must be authenticated
- user email must equal `admin@f1959.com`
- URL cannot be empty
- URL must be valid format
- URL protocol must be `http` or `https`
- upstream timeout is applied

Also included in code as future hardening note:
- add hostname/IP allowlist or blocklist to reduce SSRF risk

---

## 8) Common errors and what they mean

- **"Missing SUPABASE_URL or SUPABASE_ANON_KEY"**
  - `config.js` is missing or values not filled

- **"Invalid auth token" / 401**
  - not logged in, expired session, or wrong token

- **"Only admin user is allowed" / 403**
  - logged in as a different email

- **"Malformed URL"**
  - pasted URL is not valid

- **"Only http and https URLs are allowed"**
  - URL used another protocol

- **"Upstream timeout"**
  - target site was too slow

- **"Upstream failed (xxx)"**
  - remote website returned non-200 status

---

## 9) Architecture summary (quick)

- Frontend uses Supabase Auth session.
- Frontend sends URL to Edge Function with bearer token.
- Edge Function validates auth + admin email.
- Edge Function fetches upstream file and streams back to browser.
- No Supabase Storage in relay path.

