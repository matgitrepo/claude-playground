const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPT = `You are a product strategist helping a PM map the riskiest assumptions behind a feature idea.

Given the feature description, identify 6-10 key assumptions the team is making. For each:
- Write a clear, testable assumption statement (what must be true for this to succeed)
- Assign a category: Desirability (do users want this?), Feasibility (can we build it?), or Viability (can it sustain a business?)
- Rate confidence from 1-5 (1=very uncertain we're right, 5=very confident we're right)
- Rate impact from 1-5 (1=low impact if assumption is wrong, 5=catastrophic if wrong)
- Suggest one lean experiment to validate or invalidate this assumption quickly (1-2 sentences)

Return ONLY valid JSON matching this schema, no markdown, no explanation:
{"assumptions":[{"id":number,"statement":string,"category":string,"confidence":number,"impact":number,"experiment":string}]}`

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const path = new URL(request.url).pathname

    if (request.method === "OPTIONS") return preflight(origin, env)
    if (!isAllowed(origin, env)) return new Response("Forbidden", { status: 403 })
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })

    if (path === "/analyze") return handleAnalyze(request, env, origin)
    return new Response("Not found", { status: 404 })
  }
}

async function handleAnalyze(request, env, origin) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Anthropic API key not configured" }, 500, origin, env)

  let body
  try { body = await request.json() } catch { return json({ error: "Invalid JSON" }, 400, origin, env) }

  const { featureIdea } = body
  if (!featureIdea || typeof featureIdea !== "string") {
    return json({ error: "featureIdea required" }, 400, origin, env)
  }

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        stream: false,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: featureIdea }]
      })
    })
  } catch (e) {
    return json({ error: `Could not reach Anthropic: ${e.message}` }, 502, origin, env)
  }

  if (!res.ok) {
    const err = await res.text()
    return json({ error: `Anthropic ${res.status}: ${err}` }, res.status, origin, env)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ""

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return json({ error: "Failed to parse Claude response as JSON" }, 500, origin, env)
  }

  return json(parsed, 200, origin, env)
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
