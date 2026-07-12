/**
 * Génère woodtribe.html depuis index.html — landing WoodTribe (home /) + typo premium.
 * index.html = variante MiniNous legacy (/mininous).
 * Usage: node scripts/gen-woodtribe-html.mjs
 */
import { readFileSync, writeFileSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const INDEX = join(root, 'index.html')
const OUT = join(root, 'woodtribe.html')
const SITE = 'https://woodtribe.fr'

const WOODTRIBE_FONTS = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">'

const WOODTRIBE_PATHS = `const BASE_PATH = '';
const PAYWALL_PATH = '/commander';
const BRAND_ID = 'woodtribe';`

export function regenerateWoodtribe({ quiet = false } = {}) {
  let html = readFileSync(INDEX, 'utf8')

  html = html.replace(
    /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Quicksand[^"]+" rel="stylesheet">/,
    WOODTRIBE_FONTS,
  )

  html = html.replace(
    /const BASE_PATH = '\/mininous';\r?\nconst PAYWALL_PATH = '\/mininous\/commander';\r?\nconst BRAND_ID = 'mininous';/,
    WOODTRIBE_PATHS,
  )

  const pairs = [
    ['Les MiniNous · Figurines en bois depuis votre photo de groupe', 'WoodTribe · Figurines en bois depuis votre photo de groupe'],
    ['<meta name="author" content="Les MiniNous">', '<meta name="author" content="WoodTribe">'],
    ['<meta property="og:site_name" content="Les MiniNous">', '<meta property="og:site_name" content="WoodTribe">'],
    [`<link rel="canonical" href="${SITE}/mininous">`, `<link rel="canonical" href="${SITE}/">`],
    [`hreflang="fr" href="${SITE}/mininous"`, `hreflang="fr" href="${SITE}/"`],
    [`hreflang="x-default" href="${SITE}/mininous"`, `hreflang="x-default" href="${SITE}/"`],
    [`property="og:url" content="${SITE}/mininous"`, `property="og:url" content="${SITE}/"`],
    ['property="og:title" content="Les MiniNous · Figurines en bois depuis votre photo"', 'property="og:title" content="WoodTribe · Figurines en bois depuis votre photo"'],
    ['Figurines MiniNous en bois', 'Figurines WoodTribe en bois'],
    ['name="twitter:title" content="Les MiniNous · Figurines en bois depuis votre photo"', 'name="twitter:title" content="WoodTribe · Figurines en bois depuis votre photo"'],
    ['"name": "Les MiniNous"', '"name": "WoodTribe"'],
    [`"url": "${SITE}/mininous"`, `"url": "${SITE}/"`],
    ['<span style={{ color:\'var(--clay)\' }}>Mini</span>Nous', '<span style={{ color:\'var(--clay)\' }}>Wood</span>Tribe'],
    ['<span style={{ color:\'var(--clay-light)\' }}>Mini</span>Nous', '<span style={{ color:\'var(--clay-light)\' }}>Wood</span>Tribe'],
    ['Les MiniNous · v{info.version}', 'WoodTribe · v{info.version}'],
    ['aria-label="Instagram Les MiniNous"', 'aria-label="Instagram WoodTribe"'],
    ['aria-label="TikTok Les MiniNous"', 'aria-label="TikTok WoodTribe"'],
    ['alt="Figurines MiniNous, échelle 1/10 environ"', 'alt="Figurines WoodTribe, échelle 1/10 environ"'],
    ['aria-label="Atelier MiniNous en direct"', 'aria-label="Atelier WoodTribe en direct"'],
    ['alt="La Cabine MiniNous — photobooth et fabrication live"', 'alt="La Cabine WoodTribe — photobooth et fabrication live"'],
    ['<h2>La Cabine MiniNous</h2>', '<h2>La Cabine WoodTribe</h2>'],
    ['les MiniNous ajustent', 'les WoodTribes ajustent'],
    ['votre MiniNous sera', 'votre WoodTribe sera'],
    ['Les MiniNous sont découpées', 'Les WoodTribes sont découpées'],
    ['offrir une MiniNous', 'offrir une WoodTribe'],
    ['Les MiniNous font un cadeau', 'Les WoodTribes font un cadeau'],
    ['figurine MiniNous ?', 'figurine WoodTribe ?'],
    ['commander votre MiniNous.', 'commander votre WoodTribe.'],
    ["ctx.fillText('MiniNous', x, y);", "ctx.fillText('WoodTribe', x, y);"],
    ['alt="Marie et Philippe avec leurs MiniNous"', 'alt="Marie et Philippe avec leurs WoodTribes"'],
    ['Les MiniNous sont nés de nos explorations', 'WoodTribe est né de nos explorations'],
    ['Les MiniNous viennent de naître', 'WoodTribe vient de naître'],
    ['éditions limitées Les MiniNous', 'éditions limitées WoodTribe'],
    ['Vos MiniNous arrivent', 'Vos WoodTribes arrivent'],
    ["Vos MiniNous partent à l'atelier", "Vos WoodTribes partent à l'atelier"],
    ['{ mininous: \'pricing\' }', '{ woodtribe: \'pricing\' }'],
    ["window.history.pushState({ mininous: 'landing' }, '', BASE_PATH || '/');", "window.history.pushState({ woodtribe: 'landing' }, '', '/');"],
  ]

  for (const [from, to] of pairs) {
    if (!html.includes(from) && !quiet) {
      console.warn('⚠ pattern absent:', from.slice(0, 70))
    } else {
      html = html.split(from).join(to)
    }
  }

  html = html.replace(
    `              Vos personnages,<br/>
              <span style={{ color:'var(--clay)' }}>taillés dans le bois.</span>`,
    `              Votre tribu,<br/>
              <span style={{ color:'var(--clay)' }}>taillée dans le bois.</span>`,
  )
  html = html.replace(
    'Chaque personnage est tracé sur mesure puis gravé et découpé dans notre atelier nantais.',
    'Famille, amis ou équipe — une photo de groupe suffit. Chaque personnage est tracé sur mesure puis gravé et découpé dans notre atelier nantais.',
  )
  html = html.replace(
    '<meta name="description" content="Transformez votre photo de famille ou d\'équipe en figurines en bois sur mesure. Artisanat à Nantes, livraison en boîte aux lettres. Dès 13,90 € pour une figurine solo.">',
    '<meta name="description" content="Famille, amis ou équipe — transformez votre photo de groupe en figurines en bois sur mesure. Artisanat à Nantes, livraison en boîte aux lettres. Dès 13,90 €.">',
  )

  // Typo premium WoodTribe (Fraunces titres, DM Sans UI)
  html = html.replace(
    ':root {',
    `:root {
  --font-display:'Fraunces',serif; --font-body:'DM Sans',sans-serif;`,
  )
  html = html.replace(/body\{font-family:'Montserrat',sans-serif/g, "body{font-family:'DM Sans',sans-serif")
  html = html.replace(/h1,h2,h3,h4\{font-family:'Quicksand',sans-serif/g, "h1,h2,h3,h4{font-family:'Fraunces',serif")
  html = html.replace(/font-family:Quicksand,sans-serif/g, "font-family:'Fraunces',serif")
  html = html.replace(/font-family:'Quicksand',sans-serif/g, "font-family:'Fraunces',serif")
  html = html.replace(/fontFamily:'Quicksand'/g, "fontFamily:'Fraunces'")
  html = html.replace(/font-family:'Montserrat',sans-serif/g, "font-family:'DM Sans',sans-serif")
  html = html.replace(/'Montserrat'/g, "'DM Sans'")

  html = html.replace(/\bLes MiniNous\b/g, 'WoodTribe')
  html = html.replace(/\bMiniNous\b/g, 'WoodTribe')

  writeFileSync(OUT, html)
  const lines = html.split('\n').length
  if (!quiet) {
    console.log(`✓ woodtribe.html — ${lines} lignes (home / + /commander)`)
  }
  return { lines }
}

export function watchWoodtribeSync({ rootDir = root } = {}) {
  const indexPath = join(rootDir, 'index.html')
  let timer = null
  let running = false

  const run = () => {
    if (running) return
    running = true
    timer = null
    try {
      regenerateWoodtribe({ quiet: true })
      console.log('  ↻ woodtribe.html resynchronisé (index.html modifié)')
    } catch (err) {
      console.warn('  ⚠ sync woodtribe:', err.message)
    } finally {
      running = false
    }
  }

  watch(indexPath, { persistent: true }, (eventType) => {
    if (eventType !== 'change') return
    clearTimeout(timer)
    timer = setTimeout(run, 280)
  })

  console.log('  👀 watch index.html → woodtribe.html')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  regenerateWoodtribe()
}
