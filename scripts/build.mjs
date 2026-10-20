// Zero-dependency static site generator.
// Reads content/site.json + content/projects/*.md, copies public/, writes dist/.
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync, existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const site = JSON.parse(readFileSync(join(root, 'content/site.json'), 'utf8'));

/* ---------- helpers ---------- */

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const pad2 = (n) => String(n).padStart(2, '0');

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// Minimal frontmatter: `key: value` and `key:` followed by `  - item` lines.
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(parseScalar(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2].trim() === '') {
      data[kv[1]] = [];
      listKey = kv[1];
    } else {
      data[kv[1]] = parseScalar(kv[2]);
      listKey = null;
    }
  }
  // Empty `key:` that never got list items is just an empty value.
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length === 0 && k !== 'images') data[k] = '';
  }
  return { data, body: m[2] };
}

function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

// Markdown subset: paragraphs, "- " lists, **bold**, [links](url).
function renderBlocks(md) {
  const out = [];
  for (const block of md.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`);
    } else {
      out.push(`<p>${inline(lines.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

// Splits a markdown body into sections on "## Heading".
function renderSections(md) {
  const sections = [];
  let current = { title: null, lines: [] };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      if (current.title !== null || current.lines.join('').trim()) sections.push(current);
      current = { title: h[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.title !== null || current.lines.join('').trim()) sections.push(current);
  return sections.map((s) => ({ title: s.title, html: renderBlocks(s.lines.join('\n')) }));
}

/* ---------- shared pieces ---------- */

const arrow =
  '<svg class="arrow" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const button = (href, label, { external = false, reveal = true } = {}) =>
  `<a class="btn" href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}${reveal ? ' data-reveal' : ''}><span>${esc(label)}</span>${arrow}</a>`;

// Wraps every word in a mask so headings can slide up word by word.
// `breakAfter` lists words that should be followed by a line break.
function words(text, breakAfter = []) {
  let i = 0;
  return text
    .split(' ')
    .map((w) => {
      const html = `<span class="w"><span class="wi" style="--i:${i++}">${esc(w)}</span></span>`;
      return breakAfter.includes(w) ? `${html}<br>` : html;
    })
    .join(' ');
}

function layout({ title, description, path, active, body }) {
  const nav = (key, href, label) =>
    `<a class="nav-link${active === key ? ' is-active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap">
<link rel="stylesheet" href="/assets/style.css">
<script>
  document.documentElement.classList.add('js');
  try { if (sessionStorage.getItem('curtain')) document.documentElement.classList.add('curtain-in'); } catch (e) {}
</script>
<script src="/assets/main.js" defer></script>
</head>
<body>
<div class="curtain" aria-hidden="true"></div>
<header class="site-header">
  <div class="wrap">
    <nav class="nav" aria-label="Main">
      ${nav('projects', '/', 'Projects')}
      ${nav('about', '/about/', 'About')}
      <a class="btn nav-contact" href="/contact/"><span>Contact</span>${arrow}</a>
    </nav>
  </div>
</header>
<main class="wrap stack" data-path="${esc(path)}">
${body}
</main>
</body>
</html>
`;
}

/* ---------- content ---------- */

const projectsDir = join(root, 'content/projects');
const projects = readdirSync(projectsDir)
  .filter((f) => f.endsWith('.md'))
  .map((file) => {
    const { data, body } = parseFrontmatter(readFileSync(join(projectsDir, file), 'utf8'));
    const slug = file.replace(/\.md$/, '');
    const images = Array.isArray(data.images) ? data.images : [];
    return {
      slug,
      title: data.title || slug,
      order: typeof data.order === 'number' ? data.order : 999,
      category: data.category || 'UI / UX Design',
      type: data.type || '',
      year: data.year === '' || data.year === undefined ? '' : String(data.year),
      summary: data.summary || '',
      page: data.page !== false,
      previewUrl: data.previewUrl || '',
      cover: data.cover || images[0] || '',
      images,
      body,
    };
  })
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

const usedImages = new Set();
const useImage = (p) => {
  if (p) usedImages.add(p);
  return p;
};

/* ---------- pages ---------- */

function homePage() {
  const rows = projects
    .map((p, i) => {
      const preview = p.cover ? ` data-preview="${esc(useImage(p.cover))}"` : '';
      const inner = `<span class="row-name">${esc(p.title)}</span><span class="row-cat">${esc(p.category)}</span><span class="row-num">${pad2(i + 1)}</span>`;
      return p.page
        ? `<li data-reveal><a class="row" href="/projects/${p.slug}/"${preview}>${inner}</a></li>`
        : `<li data-reveal><div class="row row--static"${preview}>${inner}</div></li>`;
    })
    .join('\n');
  const body = `
<section class="hero">
  <h1 class="h1">${words(site.home.heroTitle)}</h1>
  <p class="lead" data-reveal>${esc(site.home.heroLead)}</p>
</section>
<h2 class="h2" id="projects" data-reveal>${esc(site.home.projectsHeading)}</h2>
<ul class="project-list">
${rows}
</ul>
<div class="cta" data-reveal>
  <p class="fine">${esc(site.footerNote)}</p>
  ${button('/about/', site.home.aboutButton, { reveal: false })}
</div>`;
  return layout({ title: site.title, description: site.description, path: '/', active: 'projects', body });
}

function entryHtml(e) {
  return `<div class="entry" data-reveal>
  <p class="entry-period">${esc(e.period)}</p>
  <p class="entry-role"><span class="entry-title">${esc(e.role)}</span><span class="entry-place">${esc(e.place)}</span></p>
  <div class="entry-text">${(e.text || []).map((t) => `<p>${esc(t)}</p>`).join('')}</div>
</div>`;
}

function aboutPage() {
  const a = site.about;
  const body = `
<h1 class="h1">${words(a.heading, ['Digital'])}</h1>
<p class="lead lead--left" data-reveal>${esc(a.intro)}</p>
<h2 class="h2" data-reveal>${esc(a.experienceHeading)}</h2>
<div class="timeline">
${a.experience.map(entryHtml).join('\n')}
</div>
<h2 class="h2" data-reveal>${esc(a.educationHeading)}</h2>
<div class="timeline">
${a.education.map(entryHtml).join('\n')}
</div>
<h2 class="h2" data-reveal>${esc(a.skillsHeading)}</h2>
<hr class="rule" data-reveal="line">
<ul class="tags">
${a.skills.map((s) => `<li data-reveal>${esc(s)}</li>`).join('\n')}
</ul>
<div class="cta" data-reveal>
  <p class="fine">${esc(site.location)}</p>
  ${button('/contact/', a.button, { reveal: false })}
</div>`;
  return layout({
    title: `About — ${site.name}`,
    description: a.intro,
    path: '/about/',
    active: 'about',
    body,
  });
}

function contactPage() {
  const c = site.contact;
  const body = `
<h1 class="h1">${words(c.heading)}</h1>
<p class="lead lead--left" data-reveal>${esc(c.lead)}</p>
<div class="contact-list">
  <hr class="rule rule--strong" data-reveal="line">
  <div class="contact-row" data-reveal>
    <span class="contact-label">${esc(c.emailLabel)}</span>
    <span class="contact-sep" aria-hidden="true"></span>
    <a class="contact-value" href="mailto:${esc(site.email)}">${esc(site.email)}</a>
  </div>
  <hr class="rule" data-reveal="line">
  <div class="contact-row" data-reveal>
    <span class="contact-label">${esc(c.linkedinLabel)}</span>
    <span class="contact-sep" aria-hidden="true"></span>
    <a class="contact-value contact-value--link" href="${esc(site.linkedin)}" target="_blank" rel="noopener noreferrer">${esc(c.linkedinText)}</a>
  </div>
  <hr class="rule" data-reveal="line">
  <div class="cta" data-reveal>
    <p class="fine">${esc(site.location)}</p>
    ${button('/about/', c.button, { reveal: false })}
  </div>
</div>`;
  return layout({
    title: `Contact — ${site.name}`,
    description: c.lead,
    path: '/contact/',
    active: 'contact',
    body,
  });
}

function projectPage(p) {
  const meta = [['Type', p.type], ['Year', p.year]].filter(([, v]) => v);
  const sections = renderSections(p.body);
  const idx = projects.findIndex((x) => x.slug === p.slug);
  const more = [];
  for (let i = 1; i < projects.length && more.length < 3; i++) {
    const q = projects[(idx + i) % projects.length];
    if (q.cover) more.push(q);
  }

  const gallery = p.images.length
    ? `<div class="gallery">
${p.images
  .map(
    (src, i) =>
      `  <figure class="frame" data-reveal="clip"><img src="${esc(useImage(src))}" alt="${esc(p.title)} — project image ${i + 1}" width="1388" height="615"${i ? ' loading="lazy"' : ''}></figure>`,
  )
  .join('\n')}
</div>`
    : '';

  const moreHtml = more.length
    ? `<h2 class="h2 h2--section" data-reveal>${esc(site.project.moreHeading)}</h2>
<div class="more">
${more
  .map((q) => {
    const inner = `<img src="${esc(useImage(q.cover))}" alt="${esc(q.title)}" width="456" height="607" loading="lazy"><span class="more-title">${esc(q.title)}</span>`;
    return q.page
      ? `  <a class="more-card" href="/projects/${q.slug}/" aria-label="${esc(q.title)}" data-reveal>${inner}</a>`
      : `  <div class="more-card" data-reveal>${inner}</div>`;
  })
  .join('\n')}
</div>
${button('/#projects', site.project.moreButton)}`
    : '';

  const body = `
<h1 class="h1 h1--page">${words(p.title)}</h1>
${p.summary ? `<p class="lead lead--left" data-reveal>${esc(p.summary)}</p>` : ''}
${
  meta.length
    ? `<dl class="meta">
${meta.map(([k, v]) => `  <div class="meta-row" data-reveal><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
</dl>`
    : ''
}
${p.previewUrl ? button(p.previewUrl, site.project.previewButton, { external: true }) : ''}
${gallery}
${sections
  .map(
    (s) =>
      `<section class="case" data-reveal>${s.title ? `<h2 class="h2 h2--section">${esc(s.title)}</h2>` : ''}<div class="prose">${s.html}</div></section>`,
  )
  .join('\n')}
${moreHtml}
<p class="fine" data-reveal>${esc(site.footerNote)}</p>`;

  return layout({
    title: `${p.title} — ${site.name}`,
    description: p.summary || site.description,
    path: `/projects/${p.slug}/`,
    active: 'projects',
    body,
  });
}

function notFoundPage() {
  const body = `
<h1 class="h1">${words('Page not found')}</h1>
<p class="lead lead--left" data-reveal>The page you are looking for does not exist.</p>
<div class="cta" data-reveal>${button('/', 'Back to projects', { reveal: false })}</div>`;
  return layout({ title: `Not found — ${site.name}`, description: site.description, path: '/404', active: null, body });
}

/* ---------- write ---------- */

const write = (rel, html) => {
  const file = join(dist, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), dist, { recursive: true });

write('index.html', homePage());
write('about/index.html', aboutPage());
write('contact/index.html', contactPage());
write('404.html', notFoundPage());
for (const p of projects.filter((x) => x.page)) write(`projects/${p.slug}/index.html`, projectPage(p));

const missing = [...usedImages].filter((src) => !existsSync(join(root, 'public', src)));
console.log(`Built ${projects.filter((x) => x.page).length} project page(s) + home, about, contact → dist/`);
if (missing.length) {
  console.warn(`\n${missing.length} image(s) referenced but not found in public/:`);
  for (const m of missing) console.warn(`  public${m}`);
}
