const SERPAPI_KEY    = process.env.SERPAPI_KEY
const WORKER_URL     = process.env.WORKER_URL
const COLLECT_SECRET = process.env.COLLECT_SECRET

if (!SERPAPI_KEY || !WORKER_URL || !COLLECT_SECRET) {
  console.error('Missing SERPAPI_KEY, WORKER_URL or COLLECT_SECRET env vars')
  process.exit(1)
}

// Queries to run — results are pooled together
const QUERIES = [
  'product manager London Berlin Amsterdam',
  'product owner London Berlin Amsterdam',
  'product manager Paris Stockholm Barcelona',
]

// Skill keywords to match against job text (lowercase)
const SKILL_KEYWORDS = [
  // Tools
  'jira', 'confluence', 'figma', 'miro', 'trello', 'asana', 'notion', 'slack',
  'tableau', 'mixpanel', 'amplitude', 'google analytics', 'looker', 'power bi', 'excel',
  'sql', 'python', 'r', 'snowflake', 'dbt',
  // Methodologies
  'agile', 'scrum', 'kanban', 'safe', 'lean', 'design thinking', 'shape up',
  // PM skills
  'product strategy', 'roadmap', 'roadmapping', 'user research', 'a/b testing',
  'data analysis', 'stakeholder management', 'prioritization', 'go-to-market',
  'competitive analysis', 'product discovery', 'user stories', 'sprint planning',
  'backlog', 'okrs', 'kpis', 'metrics', 'growth', 'retention', 'conversion',
  'customer journey', 'personas', 'mvp', 'product vision', 'product led growth',
  // Design
  'ux', 'ui', 'wireframing', 'prototyping', 'user testing', 'usability',
  // Domain
  'b2b', 'b2c', 'saas', 'api', 'mobile', 'e-commerce', 'marketplace',
  'fintech', 'healthtech', 'edtech', 'enterprise', 'platform',
  // Communication
  'stakeholders', 'cross-functional', 'leadership', 'communication', 'presentation'
]

async function fetchJobs(query) {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_jobs')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', SERPAPI_KEY)
  url.searchParams.set('hl', 'en')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  if (!data.jobs_results?.length) {
    console.log(`  Full response keys: ${Object.keys(data).join(', ')}`)
    if (data.error) console.log(`  Error: ${data.error}`)
    if (data.search_information) console.log(`  Search info: ${JSON.stringify(data.search_information)}`)
  }
  return data.jobs_results || []
}

function extractSkills(job) {
  // Combine all text sources
  const parts = [job.title || '', job.description || '']
  for (const highlight of (job.job_highlights || [])) {
    parts.push(...(highlight.items || []))
  }
  const text = parts.join(' ').toLowerCase()

  return SKILL_KEYWORDS.filter(skill => text.includes(skill))
}

async function run() {
  const allJobs = []

  for (const query of QUERIES) {
    console.log(`Fetching: "${query}"...`)
    const jobs = await fetchJobs(query)
    console.log(`  Got ${jobs.length} results`)
    allJobs.push(...jobs)
  }

  // Deduplicate by title + company
  const seen = new Set()
  const uniqueJobs = allJobs.filter(job => {
    const key = `${job.title}|${job.company_name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`Total unique jobs: ${uniqueJobs.length}`)

  // Count skills
  const skillCounts = {}
  for (const job of uniqueJobs) {
    for (const skill of extractSkills(job)) {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1
    }
  }

  const sorted = Object.entries(skillCounts).sort((a, b) => b[1] - a[1])
  console.log('Top 10 skills:', sorted.slice(0, 10).map(([s, c]) => `${s}(${c})`).join(', '))

  console.log('Sending to Worker...')
  const res = await fetch(WORKER_URL + '/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Collect-Secret': COLLECT_SECRET },
    body: JSON.stringify({ skills: skillCounts })
  })
  const result = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  console.log('Worker response:', JSON.stringify(result))
  if (!result.ok) throw new Error(`Worker rejected data: ${result.error}`)
  console.log('Done.')
}

run().catch(err => {
  console.error('ERROR:', err.message)
  process.exit(1)
})
