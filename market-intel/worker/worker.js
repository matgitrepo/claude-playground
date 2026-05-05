const JUSTJOIN_URL = "https://justjoin.it/api/offers"
const PRODUCT_CATEGORIES = ["product-management", "project-management"]
const MIN_SKILL_COUNT = 3 // ignore skills mentioned fewer than this many times

export default {
  // Frontend API
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const path = new URL(request.url).pathname

    // Manual collection trigger — secret-protected, no origin check needed
    if (path === "/collect") {
      const secret = request.headers.get("X-Collect-Secret")
      if (!secret || secret !== env.COLLECT_SECRET) {
        return new Response("Forbidden", { status: 403 })
      }
      try {
        await collectSnapshot(env)
        return new Response(JSON.stringify({ ok: true, message: "Snapshot collected" }), {
          headers: { "Content-Type": "application/json" }
        })
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message, stack: err.stack }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      }
    }

    if (request.method === "OPTIONS") return preflight(origin, env)
    if (!isAllowed(origin, env)) return new Response("Forbidden", { status: 403 })

    if (path === "/trends") return handleTrends(env, origin)

    return new Response("Not found", { status: 404 })
  },

  // Daily cron
  async scheduled(event, env, ctx) {
    ctx.waitUntil(collectSnapshot(env))
  }
}

async function collectSnapshot(env) {
  const res = await fetch(JUSTJOIN_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; market-intel-bot/1.0)" }
  })
  if (!res.ok) throw new Error(`JustJoin fetch failed: ${res.status}`)

  const offers = await res.json()

  const productOffers = offers.filter(o =>
    PRODUCT_CATEGORIES.includes(o.marker_icon)
  )

  const skillCounts = {}
  for (const offer of productOffers) {
    for (const skill of (offer.skills || [])) {
      const name = skill.name?.trim().toLowerCase()
      if (name) skillCounts[name] = (skillCounts[name] || 0) + 1
    }
  }

  const today = new Date().toISOString().split("T")[0]

  // Idempotent: delete today's existing data before reinserting
  await env.DB.prepare("DELETE FROM snapshots WHERE captured_date = ?").bind(today).run()

  const entries = Object.entries(skillCounts).filter(([, count]) => count >= 1)
  if (entries.length > 0) {
    const stmt = env.DB.prepare(
      "INSERT INTO snapshots (captured_date, skill, count) VALUES (?, ?, ?)"
    )
    await env.DB.batch(entries.map(([skill, count]) => stmt.bind(today, skill, count)))
  }

  console.log(`[${today}] ${productOffers.length} product offers, ${entries.length} skills stored`)
}

async function handleTrends(env, origin) {
  const meta = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT captured_date) AS days_of_data,
      MAX(captured_date)            AS last_updated
    FROM snapshots
  `).first()

  const daysOfData = meta?.days_of_data || 0
  const lastUpdated = meta?.last_updated || null

  // Current window: last 30 days
  const current = await env.DB.prepare(`
    SELECT skill, SUM(count) AS total
    FROM snapshots
    WHERE captured_date >= date('now', '-30 days')
    GROUP BY skill
    HAVING total >= ?
    ORDER BY total DESC
  `).bind(MIN_SKILL_COUNT).all()

  let trends

  if (daysOfData >= 30) {
    // Previous window: 30–60 days ago
    const previous = await env.DB.prepare(`
      SELECT skill, SUM(count) AS total
      FROM snapshots
      WHERE captured_date >= date('now', '-60 days')
        AND captured_date <  date('now', '-30 days')
      GROUP BY skill
    `).all()

    const prevMap = {}
    for (const row of previous.results) prevMap[row.skill] = row.total

    trends = current.results
      .map(row => {
        const prev = prevMap[row.skill] || 0
        const change = prev > 0
          ? Math.round(((row.total - prev) / prev) * 100)
          : null
        return { skill: row.skill, count: row.total, change, is_new: prev === 0 }
      })
      .filter(t => t.change > 0 || t.is_new)
      .sort((a, b) => {
        // Sort by % change; treat new skills as +100%
        const ca = a.change ?? 100
        const cb = b.change ?? 100
        return cb - ca
      })
      .slice(0, 5)
  } else {
    // Not enough history — return top skills by count instead
    trends = current.results.slice(0, 5).map(row => ({
      skill: row.skill,
      count: row.total,
      change: null,
      is_new: false
    }))
  }

  return json({ trends, days_of_data: daysOfData, last_updated: lastUpdated }, 200, origin, env)
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Collect-Secret"
    }
  })
}

function preflight(origin, env) {
  if (!isAllowed(origin, env)) return new Response(null, { status: 403 })
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowHeader(origin, env),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Collect-Secret"
    }
  })
}
