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
- `supabase/functions/bright-task/index.ts` – secure relay function
- `supabase/config.toml` – function config (`verify_jwt = false`, preflight CORS용, bright-task)

---

## 4) Prerequisites

You need:
1. A Supabase account
2. A Supabase project

Supabase CLI is **optional**.
- If you like terminal commands, use CLI.
- If you prefer no terminal, use the Supabase web dashboard.

Supabase CLI docs (optional):
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

## Step F — Choose deploy method (CLI or Web Dashboard)

You can choose either method:

### Method 1: CLI (optional)

1. Login:

```bash
supabase login
```

2. Deploy function from project root:

```bash
supabase functions deploy bright-task
```

3. Set function secrets:

```bash
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### Method 2: Supabase Web Dashboard (no CLI)

1. In your Supabase project, open **Edge Functions**.
2. Create a function named `bright-task`.
3. Paste the code from `supabase/functions/bright-task/index.ts`.
4. Deploy/publish the function in the dashboard.
5. In project settings for Edge Function secrets/environment variables, add:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_ANON_KEY` = your anon key

Why secrets?
- The function needs these env vars server-side.

Important CORS note:
- `supabase/config.toml` for bright-task should use `verify_jwt = false`.
- Reason: browser preflight `OPTIONS` request has no bearer token, so `verify_jwt = true` can be blocked before your code runs.
- Security is still enforced in `index.ts` because POST manually validates bearer token + admin email.

---

## Step G — Host the static frontend files

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

- **"Download error: Failed to fetch"**
  - usually CORS/preflight failure between frontend and Edge Function
  - check `supabase/config.toml` has `verify_jwt = false` for bright-task
  - confirm Edge Function handles `OPTIONS` and returns CORS headers
  - redeploy function after code/config update

- **Network 탭에 404 + CORS 에러가 같이 뜸**
  - 이 경우는 대부분 CORS 코드 문제가 아니라 **함수 라우트 미배포/함수명 불일치** 문제
  - 먼저 브라우저에서 아래 URL을 직접 열어 확인:
    - `https://YOUR_PROJECT_REF.supabase.co/functions/v1/bright-task`
    - 정상이라면 `{"ok":true,"function":"bright-task"}` 비슷한 JSON이 보여야 함
  - 404면 아래를 확인:
    1. Supabase Edge Functions에 함수 이름이 정확히 `bright-task`인지
    2. 최신 코드로 재배포했는지
    3. 현재 프로젝트 ref가 프런트 `SUPABASE_URL`과 같은 프로젝트인지

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

