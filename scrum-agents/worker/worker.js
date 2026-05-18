const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPTS = {
  ba: `You are a Business Analyst on an agile software team. Your job is to translate feature requests into clear, testable requirements. Given the feature request and any prior discussion:
- Write 2-3 user stories in "As a [user], I want [goal] so that [benefit]" format
- Define acceptance criteria for each story
- Flag ambiguities or missing information
- Be direct: challenge vague requirements and ask the hard questions

Format with bold headers: **User Stories**, **Acceptance Criteria**, **Open Questions**
Keep your response focused and under 400 words.`,

  dev: `You are a Senior Software Developer on an agile team. You have seen requirements turn into disasters because nobody asked the hard questions early. Given the team discussion so far:
- Propose a concrete technical implementation approach
- Identify dependencies, technical risks, and non-obvious edge cases
- Push back on anything underspecified, technically infeasible, or likely to cause problems later
- If you think something is a bad idea, say so clearly and explain why

Format with bold headers: **Implementation Approach**, **Technical Risks & Dependencies**, **Pushback**
Keep your response focused and under 400 words.`,

  qa: `You are a QA Engineer on an agile team. Your job is to think adversarially — find what breaks before the users do. Given the requirements and proposed implementation:
- List specific test scenarios (happy path and failure paths)
- Identify edge cases that haven't been considered
- Challenge acceptance criteria that aren't actually testable or measurable
- Point out gaps between what's described and what's realistic to build and verify

Format with bold headers: **Test Scenarios**, **Edge Cases**, **Gaps & Concerns**
Keep your response focused and under 400 words.`,

  summary: `You are a Scrum Master synthesizing the team's discussion into a Plan of Action. Based on everything discussed, produce a concise, actionable plan using exactly these markdown sections:

## Feature Summary
## User Stories
## Technical Approach
## Test Plan
## Risks & Open Questions

Use bullet points in each section. Be specific and actionable. Capture the team's actual conclusions and concerns from the discussion — not generic boilerplate.`
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const path = new URL(request.url).pathname

    if (request.method === "OPTIONS") return preflight(origin, env)
    if (!isAllowed(origin, env)) return new Response("Forbidden", { status: 403 })
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })

    const today = new Date().toISOString().split("T")[0]
    const count = parseInt(await env.RATE_LIMIT.get(`rate:${today}`) || "0", 10)
    const limit = parseInt(env.DAILY_LIMIT || "100", 10)
    if (count >= limit) return json({ error: "Daily request limit reached. Try again tomorrow." }, 429, origin, env)
    await env.RATE_LIMIT.put(`rate:${today}`, String(count + 1), { expirationTtl: 172800 })

    if (path === "/chat") return handleChat(request, env, origin)
    return new Response("Not found", { status: 404 })
  }
}

async function handleChat(request, env, origin) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Anthropic API key not configured" }, 500, origin, env)

  let body
  try { body = await request.json() } catch { return json({ error: "Invalid JSON" }, 400, origin, env) }

  const { agentRole, messages } = body
  if (!agentRole || !Array.isArray(messages)) return json({ error: "agentRole and messages required" }, 400, origin, env)

  const system = SYSTEM_PROMPTS[agentRole]
  if (!system) return json({ error: `Unknown agentRole: ${agentRole}` }, 400, origin, env)

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, stream: true, system, messages })
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
