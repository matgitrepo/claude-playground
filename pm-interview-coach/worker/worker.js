const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPTS = {
  question: (type) => `You are a senior PM interviewer conducting a ${type} interview. Ask ONE opening interview question. Be specific and challenging — no warm-up softballs. No preamble, no "great, let's begin" — just the question itself. Max 80 words.`,

  followup: (type) => `You are a senior PM interviewer conducting a ${type} interview. The candidate has just answered. Ask ONE sharp follow-up question that probes deeper. Push on weak reasoning, missing structure, unaddressed trade-offs, or vague claims. No preamble — just the question. Max 80 words.`,

  feedback: () => `You are a senior PM interviewer giving post-interview feedback. The candidate has completed their interview. Give honest, specific feedback referencing what they actually said. Use exactly these bold markdown headers:

**What Landed**
**What Was Weak**
**What a Strong Answer Includes**

Be direct. Max 500 words.`
}

const TYPE_LABELS = {
  "product-sense": "Product Sense",
  "prioritization": "Prioritization",
  "estimation": "Estimation"
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const path = new URL(request.url).pathname

    if (request.method === "OPTIONS") return preflight(origin, env)
    if (!isAllowed(origin, env)) return new Response("Forbidden", { status: 403 })
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })

    if (path === "/chat") return handleChat(request, env, origin)
    return new Response("Not found", { status: 404 })
  }
}

async function handleChat(request, env, origin) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Anthropic API key not configured" }, 500, origin, env)

  let body
  try { body = await request.json() } catch { return json({ error: "Invalid JSON" }, 400, origin, env) }

  const { phase, interviewType, messages } = body
  if (!phase || !interviewType || !Array.isArray(messages)) {
    return json({ error: "phase, interviewType, and messages required" }, 400, origin, env)
  }

  const typeLabel = TYPE_LABELS[interviewType] || interviewType
  const systemFn = SYSTEM_PROMPTS[phase]
  if (!systemFn) return json({ error: `Unknown phase: ${phase}` }, 400, origin, env)
  const system = systemFn(typeLabel)

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, stream: true, system, messages })
    })
  } catch (e) {
    return json({ error: `Could not reach Anthropic: ${e.message}` }, 502, origin, env)
  }

  if (!res.ok) {
    const err = await res.text()
    return json({ error: `Anthropic ${res.status}: ${err}` }, res.status, origin, env)
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": allowHeader(origin, env),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  })
}

function isAllowed(origin, env) {
  if (!env.ALLOWED_ORIGIN) return false
  return env.ALLOWED_ORIGIN.split(",").map(s => s.trim()).some(o => o === origin || o === "*")
}

function allowHeader(origin, env) {
  const list = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim())
  return list.includes("*") ? "*" : origin
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowHeader(origin, env),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  })
}

function preflight(origin, env) {
  if (!isAllowed(origin, env)) return new Response(null, { status: 403 })
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowHeader(origin, env),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  })
}
