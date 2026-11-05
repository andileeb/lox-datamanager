/**
 * docs/ → GitHub wiki pages (run by .github/workflows/wiki.yml on pushes to main).
 * docs/ stays the source; the wiki is overwritten each run.
 *
 *   node scripts/wiki-sync.mts <docs-dir> <wiki-checkout>
 *
 * guide.md becomes Home; every other page is named after its "# Title" (the wiki shows the
 * name as the heading, so the H1 is dropped); links between pages and to the README are rewritten.
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const REPO = 'https://github.com/andileeb/lox-datamanager'
/** developer-only pages */
const SKIP = new Set(['e2e-checklist.md'])

const [docsDir, wikiDir] = process.argv.slice(2)
if (!docsDir || !wikiDir) throw new Error('usage: wiki-sync.mts <docs-dir> <wiki-checkout>')

const files = readdirSync(docsDir).filter((f) => f.endsWith('.md') && !SKIP.has(f))
const pages = files.map((file) => {
  const text = readFileSync(join(docsDir, file), 'utf8')
  const title = /^# (.+)$/m.exec(text)?.[1].trim() ?? file.replace(/\.md$/, '')
  // punctuation in wiki page names breaks links → "&" becomes "and", the rest is dropped
  const slug = title
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return { file, title, name: file === 'guide.md' ? 'Home' : slug, text }
})
// sidebar in the order the guide lists the pages
const guide = pages.find((p) => p.name === 'Home')?.text ?? ''
const order = (p: { file: string }): number => {
  const i = guide.indexOf(`](${p.file}`)
  return i < 0 ? Infinity : i
}
pages.sort((a, b) => order(a) - order(b))
const nameOf = new Map(pages.map((p) => [p.file, p.name]))

function rewrite(md: string): string {
  return md
    .replace(/^# .+\n+/m, '')
    .replace(/\]\(\.\.\/README\.md(#[^)]*)?\)/g, (_, hash = '') => `](${REPO}${hash})`)
    .replace(/\]\(([\w-]+\.md)(#[^)]*)?\)/g, (m, file: string, hash = '') =>
      nameOf.has(file)
        ? `](${nameOf.get(file)}${hash})`
        : `](${REPO}/blob/main/docs/${file}${hash})`
    )
    .replace(/\]\((images\/[^)]+)\)/g, `](${REPO}/raw/main/docs/$1)`)
}

// the wiki only holds generated pages → clear old ones so renamed/removed docs disappear
for (const f of readdirSync(wikiDir)) if (f.endsWith('.md')) rmSync(join(wikiDir, f))
for (const p of pages) writeFileSync(join(wikiDir, `${p.name}.md`), rewrite(p.text))
writeFileSync(
  join(wikiDir, '_Sidebar.md'),
  [
    '**[Home](Home)**',
    '',
    ...pages.filter((p) => p.name !== 'Home').map((p) => `- [${p.title}](${p.name})`)
  ].join('\n') + '\n'
)
writeFileSync(
  join(wikiDir, '_Footer.md'),
  `_Generated from [docs/](${REPO}/tree/main/docs) — edit there; changes made in the wiki are overwritten._\n`
)
console.log(`${pages.length} pages → ${wikiDir}`)
