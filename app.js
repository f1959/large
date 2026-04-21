import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "admin@f1959.com";

const supabaseUrl = window.__SUPABASE_URL__ ?? "";
const supabaseAnonKey = window.__SUPABASE_ANON_KEY__ ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY. See README setup.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const statusEl = document.getElementById("status");
const loginForm = document.getElementById("login-form");
const downloadForm = document.getElementById("download-form");
const logoutBtn = document.getElementById("logout-btn");

function setStatus(message) {
  statusEl.textContent = message || "";
}

function showLoggedOut() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
}

function showLoggedIn() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}

function parseFilenameFromContentDisposition(value) {
  if (!value) return null;
  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1];
  return null;
}

function filenameFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const raw = url.pathname.split("/").filter(Boolean).pop();
    return raw || "download.bin";
  } catch {
    return "download.bin";
  }
}

async function syncViewFromSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setStatus(`Session error: ${error.message}`);
    showLoggedOut();
    return;
  }

  const session = data.session;
  if (!session) {
    showLoggedOut();
    return;
  }

  const userEmail = session.user?.email?.toLowerCase();
  if (userEmail !== ADMIN_EMAIL) {
    await supabase.auth.signOut();
    setStatus("Only the admin account is allowed.");
    showLoggedOut();
    return;
  }

  showLoggedIn();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Logging in...");
  const password = new FormData(loginForm).get("password")?.toString() ?? "";

  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password,
  });

  if (error) {
    setStatus(`Login failed: ${error.message}`);
    return;
  }

  loginForm.reset();
  setStatus("Logged in.");
  showLoggedIn();
});

downloadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Starting relay download...");

  const rawUrl = new FormData(downloadForm).get("url")?.toString().trim() ?? "";
  if (!rawUrl) {
    setStatus("Please enter a URL.");
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    setStatus("Not authenticated. Please login again.");
    showLoggedOut();
    return;
  }

  const accessToken = data.session.access_token;

  try {
    const relayResponse = await fetch(`${supabaseUrl}/functions/v1/bright-task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: rawUrl }),
    });

    if (!relayResponse.ok) {
      let message = `Relay failed (${relayResponse.status})`;
      try {
        const json = await relayResponse.json();
        if (json?.error) message = json.error;
      } catch {
        // Keep fallback message.
      }
      setStatus(message);
      return;
    }

    const contentDisposition = relayResponse.headers.get("content-disposition");
    const filename = parseFilenameFromContentDisposition(contentDisposition) || filenameFromUrl(rawUrl);

    // Browser-side download commonly requires a Blob/Object URL. This can still use memory,
    // but the server-side relay path remains streamed with no permanent storage.
    const blob = await relayResponse.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    setStatus("Download complete.");
  } catch (err) {
    setStatus(`Download error: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setStatus("Logged out.");
  showLoggedOut();
});

supabase.auth.onAuthStateChange(() => {
  syncViewFromSession();
});

syncViewFromSession();
