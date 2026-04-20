import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "admin@f1959.com";
const UPSTREAM_TIMEOUT_MS = 25000;

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return jsonError(401, "Missing bearer token");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError(500, "Server is missing Supabase environment variables");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Security-sensitive check: validate the current auth user from JWT and enforce single-admin policy.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return jsonError(401, "Invalid auth token");
  }

  if ((userData.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
    return jsonError(403, "Only admin user is allowed");
  }

  let parsedBody: { url?: string };
  try {
    parsedBody = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const rawUrl = (parsedBody.url || "").trim();
  if (!rawUrl) {
    return jsonError(400, "URL is required");
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return jsonError(400, "Malformed URL");
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return jsonError(400, "Only http and https URLs are allowed");
  }

  // Future hardening note: add hostname/IP allowlist or blocklist checks here
  // to reduce SSRF risk in stricter environments.

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return jsonError(502, `Upstream failed (${upstreamResponse.status})`);
    }

    const upstreamType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
    const upstreamDisposition = upstreamResponse.headers.get("content-disposition");

    const fallbackName = sanitizeFilename(filenameFromUrl(targetUrl.toString()));
    const contentDisposition = upstreamDisposition || `attachment; filename="${fallbackName}"`;

    // Stream-through response body directly without storing file on disk.
    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        "Content-Type": upstreamType,
        "Content-Disposition": contentDisposition,
        "Cache-Control": "no-store",
        "X-Relay": "supabase-edge-relay",
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return jsonError(504, "Upstream timeout");
    }
    return jsonError(502, "Failed to fetch upstream URL");
  } finally {
    clearTimeout(timeoutId);
  }
});
