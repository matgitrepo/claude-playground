/**
 * Hiking Planner — Cloudflare Worker Proxy
 *
 * Forwards requests from the frontend to the OpenAI API.
 * The API key is stored as a Cloudflare secret (never in code).
 *
 * Environment variables (set via wrangler secret / dashboard):
 *   OPENAI_API_KEY  — your OpenAI API key
 *
 * Environment variables (set in wrangler.toml [vars]):
 *   ALLOWED_ORIGIN  — comma-separated list of allowed origins
 *                     e.g. "https://matgitrepo.github.io,http://localhost"
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204, origin, env)
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 })
    }

    // Origin check — block requests not from your app
    if (!isAllowedOrigin(origin, env)) {
      return new Response("Forbidden", { status: 403 })
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ error: "API key not configured" }, 500, origin)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin)
    }

    // Only allow the cheap model — prevents abuse if someone calls your worker directly
    if (body.model && body.model !== "gpt-4o-mini") {
      body.model = "gpt-4o-mini"
    }

    // Cap max_tokens to limit cost per request
    body.max_tokens = Math.min(body.max_tokens || 200, 300)

    try {
      const upstream = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      })

      const data = await upstream.json()
      return jsonResponse(data, upstream.status, origin)

    } catch (err) {
      return jsonResponse({ error: "Upstream request failed" }, 502, origin)
    }
  }
}

function isAllowedOrigin(origin, env) {
  if (!env.ALLOWED_ORIGIN) return false
  const allowed = env.ALLOWED_ORIGIN.split(",").map(s => s.trim())
  return allowed.includes(origin) || allowed.includes("*")
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  })
}

function corsResponse(body, status, origin, env) {
  if (!isAllowedOrigin(origin, env)) {
    return new Response(null, { status: 403 })
  }
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  })
}
