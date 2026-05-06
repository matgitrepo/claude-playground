const { chromium } = require('playwright-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
chromium.use(StealthPlugin())

const WORKER_URL    = process.env.WORKER_URL
const COLLECT_SECRET = process.env.COLLECT_SECRET

if (!WORKER_URL || !COLLECT_SECRET) {
  console.error('Missing WORKER_URL or COLLECT_SECRET env vars')
  process.exit(1)
}

async function run() {
  console.log('Launching browser...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US'
  })
  const page = await context.newPage()

  let jobData = null

  // Intercept every JSON response and log what we see
  page.on('response', async response => {
    try {
      const ct = response.headers()['content-type'] || ''
      if (!ct.includes('application/json')) return

      const body = await response.json().catch(() => null)
      if (!body) return

      const preview = JSON.stringify(body).slice(0, 300)
      console.log(`[JSON] ${response.url()}\n  ${preview}\n`)

      if (jobData) return

      // Support flat array or wrapped responses
      const arr = Array.isArray(body)
        ? body
        : body.data ?? body.offers ?? body.items ?? body.results ?? null

      if (Array.isArray(arr) && arr.length > 5) {
        // Log the keys of the first item so we know the field names
        console.log(`[CANDIDATE] ${arr.length} items, first item keys: ${Object.keys(arr[0] || {}).join(', ')}`)
        // Check for any skill-like field
        const first = arr[0] || {}
        if (first.skills || first.requirements || first.technologies || first.tags || first.techStack) {
          jobData = arr
          console.log(`Captured ${arr.length} offers from: ${response.url()}`)
        }
      }
    } catch {}
  })

  console.log('Navigating to JustJoin.it product management listings...')
  await page.goto('https://justjoin.it/job-offers/product-management', {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  })

  // Wait for dynamic content to load
  await page.waitForTimeout(8000)

  const title = await page.title()
  console.log(`Page title: "${title}"`)

  const html = await page.content()
  console.log(`Page HTML snippet: ${html.slice(0, 500)}`)

  await browser.close()

  if (!jobData) {
    throw new Error('Could not intercept job listing data. JustJoin.it may have changed their API.')
  }

  console.log(`Processing ${jobData.length} offers...`)

  const skillCounts = {}
  for (const offer of jobData) {
    for (const skill of (offer.skills || [])) {
      const name = skill.name?.trim().toLowerCase()
      if (name) skillCounts[name] = (skillCounts[name] || 0) + 1
    }
  }

  const skillCount = Object.keys(skillCounts).length
  console.log(`Found ${skillCount} unique skills`)

  if (skillCount === 0) {
    throw new Error('No skills found in captured data — check response structure')
  }

  console.log('Top 10 skills found:',
    Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([s, c]) => `${s}(${c})`)
      .join(', ')
  )

  console.log('Sending to Worker...')
  const res = await fetch(WORKER_URL + '/collect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Collect-Secret': COLLECT_SECRET
    },
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
