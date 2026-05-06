const { chromium } = require('playwright')

const WORKER_URL     = process.env.WORKER_URL
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
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
  })

  // Hide webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()
  let jobData = null

  page.on('response', async response => {
    try {
      const ct = response.headers()['content-type'] || ''
      if (!ct.includes('application/json')) return

      const body = await response.json().catch(() => null)
      if (!body) return

      const preview = JSON.stringify(body).slice(0, 200)
      console.log(`[JSON] ${response.url()}\n  preview: ${preview}`)

      if (jobData) return

      const arr = Array.isArray(body)
        ? body
        : body.data ?? body.offers ?? body.items ?? body.results ?? null

      if (Array.isArray(arr) && arr.length > 5) {
        const keys = Object.keys(arr[0] || {}).join(', ')
        console.log(`[CANDIDATE] ${arr.length} items, keys: ${keys}`)
        const first = arr[0] || {}
        if (first.skills || first.requirements || first.technologies || first.tags || first.techStack) {
          jobData = arr
          console.log(`Captured ${arr.length} offers`)
        }
      }
    } catch (e) {
      console.log(`[response handler error] ${e.message}`)
    }
  })

  console.log('Navigating...')
  try {
    await page.goto('https://justjoin.it/job-offers/product-management', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    })
    console.log('Navigation complete')
  } catch (e) {
    console.log(`Navigation error: ${e.message}`)
  }

  console.log('Waiting for dynamic content...')
  await new Promise(r => setTimeout(r, 8000))

  console.log(`Page title: "${await page.title().catch(() => 'error')}"`)

  // Also check for __NEXT_DATA__ embedded in the page
  const nextData = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__')
    return el ? el.textContent.slice(0, 1000) : null
  }).catch(() => null)

  if (nextData) console.log(`__NEXT_DATA__ found: ${nextData}`)
  else console.log('No __NEXT_DATA__ found')

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

  console.log(`Found ${Object.keys(skillCounts).length} unique skills`)
  console.log('Top skills:', Object.entries(skillCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([s,c])=>`${s}(${c})`).join(', '))

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
