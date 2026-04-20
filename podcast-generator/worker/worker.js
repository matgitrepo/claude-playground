const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/text-to-speech"
const DEFAULT_VOICE_A = "21m00Tcm4TlvDq8ikWAM" // Rachel
const DEFAULT_VOICE_B = "pNInz6obpgDQGcFmaJgB" // Adam

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const path = new URL(request.url).pathname

    if (request.method === "OPTIONS") return preflight(origin, env)
    if (!isAllowed(origin, env)) return new Response("Forbidden", { status: 403 })
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })

    if (path === "/dialog") return handleDialog(request, env, origin)
    if (path === "/tts")    return handleTTS(request, env, origin)

    return new Response("Not found", { status: 404 })
  }
}

async function handleDialog(request, env, origin) {
  if (!env.OPENAI_API_KEY) return json({ error: "OpenAI API key not configured" }, 500, origin, env)

  let body
  try { body = await request.json() } catch { return json({ error: "Invalid JSON" }, 400, origin, env) }

  const { topic } = body
  if (!topic) return json({ error: "topic required" }, 400, origin, env)

  const prompt = `Write a natural, engaging podcast conversation between two hosts (Host A and Host B) about: "${topic}".

10-12 exchanges. Each turn is 2-3 sentences. Conversational, informative, with personality. No introductions like "Welcome to the show".

Respond with a JSON array only, no markdown:
[{"speaker":"A","text":"..."},{"speaker":"B","text":"..."},...]`

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a podcast script writer. Always respond with valid JSON only, no markdown." },
          { role: "user", content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.7
      })
    })
    const data = await res.json()
    return json(data, res.status, origin, env)
  } catch {
    return json({ error: "Dialog generation failed" }, 502, origin, env)
  }
}

async function handleTTS(request, env, origin) {
  if (!env.ELEVENLABS_API_KEY) return json({ error: "ElevenLabs API key not configured" }, 500, origin, env)

  let body
  try { body = await request.json() } catch { return json({ error: "Invalid JSON" }, 400, origin, env) }

  const { text, speaker } = body
  if (!text || !speaker) return json({ error: "text and speaker required" }, 400, origin, env)

  const voiceId = speaker === "A"
    ? (env.VOICE_A || DEFAULT_VOICE_A)
    : (env.VOICE_B || DEFAULT_VOICE_B)

  try {
    const res = await fetch(`${ELEVENLABS_BASE}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    })

    if (!res.ok) {
      const err = await res.text()
      return json({ error: `ElevenLabs ${res.status}: ${err}` }, res.status, origin, env)
    }

    const audio = await res.arrayBuffer()
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": allowHeader(origin, env),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    })
  } catch {
    return json({ error: "TTS generation failed" }, 502, origin, env)
  }
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
