import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "admin@f1959.com";
const UPSTREAM_TIMEOUT_MS = 25000;

// Optional hardening: set ALLOWED_ORIGIN to your frontend origin (e.g. https://f1959.github.io)
// If unset, keeps existing behavior with '*'.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

function getCorsHeaders(req: Request): HeadersInit {
  const requestOrigin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGIN === "*" ? "*" : requestOrigin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Expose-Headers": "content-disposition, content-type",
    Vary: "Origin",
  };
}

function jsonError(req: Request, status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function filenameFromUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    const name = url.pathname.split("/").filter(Boolean).pop();
    return name || "download.bin";
  } catch {
    return "download.bin";
  }
}

function sanitizeFilename(input: string): string {
  return input.replace(/[\r\n"\\/<>:*?|]+/g, "_").slice(0, 180) || "download.bin";
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // Basic SSRF guardrails that should not affect normal public URLs.
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h === "0.0.0.0" || h === "127.0.0.1") return true;
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  if (h.endsWith(".local")) return true;
  if (isPrivateIPv4(h)) return true;

  return false;
}

Deno.serve(async (req) => {
  // Browser preflight support for cross-origin authenticated fetch.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: getCorsHeaders(req) });
  }

  // Quick health check so deployment/path issues are easy to debug from browser.
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "bright-task" }), {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonError(req, 405, "Method not allowed");
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return jsonError(req, 401, "Missing bearer token");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError(req, 500, "Server is missing Supabase environment variables");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Security-sensitive check: validate the current auth user from JWT and enforce single-admin policy.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return jsonError(req, 401, "Invalid auth token");
  }

  if ((userData.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
    return jsonError(req, 403, "Only admin user is allowed");
  }

  let parsedBody: { url?: string };
  try {
    parsedBody = await req.json();
  } catch {
    return jsonError(req, 400, "Invalid JSON body");
  }

  const rawUrl = (parsedBody.url || "").trim();
  if (!rawUrl) {
    return jsonError(req, 400, "URL is required");
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return jsonError(req, 400, "Malformed URL");
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return jsonError(req, 400, "Only http and https URLs are allowed");
  }

  if (isBlockedHost(targetUrl.hostname)) {
    return jsonError(req, 400, "Blocked target host");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return jsonError(req, 502, `Upstream failed (${upstreamResponse.status})`);
    }

    const upstreamType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
    const upstreamDisposition = upstreamResponse.headers.get("content-disposition");

    const fallbackName = sanitizeFilename(filenameFromUrl(targetUrl.toString()));
    const contentDisposition = upstreamDisposition || `attachment; filename="${fallbackName}"`;

    // Stream-through response body directly without storing file on disk.
    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": upstreamType,
        "Content-Disposition": contentDisposition,
        "Cache-Control": "no-store",
        "X-Relay": "supabase-edge-relay",
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return jsonError(req, 504, "Upstream timeout");
    }
    return jsonError(req, 502, "Failed to fetch upstream URL");
  } finally {
    clearTimeout(timeoutId);
  }
});
