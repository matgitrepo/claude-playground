const MIN_SKILL_COUNT = 3

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ""
    const path = new URL(request.url).pathname

    // Collection endpoint — accepts skill counts from the GitHub Action scraper
    if (path === "/collect") {
      const secret = request.headers.get("X-Collect-Secret")
      if (!secret || secret !== env.COLLECT_SECRET) {
        return new Response("Forbidden", { status: 403 })
      }
      let body
      try { body = await request.json() } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } })
      }
      try {
        await storeSnapshot(env, body.skills)
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } })
      }
    }

    if (request.method === "OPTIONS") return preflight(origin, env)
    if (!isAllowed(origin, env)) return new Response("Forbidden", { status: 403 })

    if (path === "/trends") return handleTrends(env, origin)

    return new Response("Not found", { status: 404 })
  }
}

async function storeSnapshot(env, skills) {
  if (!skills || typeof skills !== "object") throw new Error("skills object required")

  const today = new Date().toISOString().split("T")[0]
  await env.DB.prepare("DELETE FROM snapshots WHERE captured_date = ?").bind(today).run()

  const entries = Object.entries(skills).filter(([, count]) => count >= 1)
  if (entries.length > 0) {
    const stmt = env.DB.prepare("INSERT INTO snapshots (captured_date, skill, count) VALUES (?, ?, ?)")
    await env.DB.batch(entries.map(([skill, count]) => stmt.bind(today, skill, count)))
  }

  console.log(`[${today}] ${entries.length} skills stored`)
}

async function handleTrends(env, origin) {
  const meta = await env.DB.prepare(`
    SELECT COUNT(DISTINCT captured_date) AS days_of_data, MAX(captured_date) AS last_updated
    FROM snapshots
  `).first()

  const daysOfData = meta?.days_of_data || 0
  const lastUpdated = meta?.last_updated || null

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
        const change = prev > 0 ? Math.round(((row.total - prev) / prev) * 100) : null
        return { skill: row.skill, count: row.total, change, is_new: prev === 0 }
      })
      .filter(t => t.change > 0 || t.is_new)
      .sort((a, b) => (b.change ?? 100) - (a.change ?? 100))
      .slice(0, 5)
  } else {
    trends = current.results.slice(0, 5).map(row => ({
      skill: row.skill, count: row.total, change: null, is_new: false
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
