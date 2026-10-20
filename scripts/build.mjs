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

// "**Label:** text" or "**Label**: text" -> { label, rest }, otherwise null.
function splitLabel(text) {
  const m = text.match(/^\*\*(.+?)\*\*(:?)\s*(.*)$/);
  if (!m) return null;
  const labelHasColon = /:\s*$/.test(m[1]);
  if (!labelHasColon && m[2] !== ':') return null;
  return { label: m[1].replace(/:\s*$/, '').trim(), rest: m[3] };
}

// Markdown subset: paragraphs, "- " lists, **bold**, [links](url).
// Case-study conventions get richer markup:
//   - the first plain paragraph of the first section becomes a large lead
//   - "**Label:** text" paragraphs become labelled rows
//   - lists whose items all start with a bold label become numbered cards
function renderBlocks(md, lead = false) {
  const out = [];
  let leadPending = lead;
  for (const block of md.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      const items = lines.map((l) => l.replace(/^\s*[-*]\s+/, ''));
      const parsed = items.map(splitLabel);
      if (parsed.every(Boolean)) {
        out.push(
          `<ul class="cards">${parsed
            .map(
              (it, i) =>
                `<li class="card" data-reveal><span class="card-num">${pad2(i + 1)}</span><h3 class="card-title">${inline(it.label)}</h3>${it.rest ? `<p>${inline(it.rest)}</p>` : ''}</li>`,
            )
            .join('')}</ul>`,
        );
      } else {
        out.push(`<ul class="bullets">${items.map((t) => `<li data-reveal>${inline(t)}</li>`).join('')}</ul>`);
      }
    } else {
      const text = lines.join(' ');
      const f = splitLabel(text);
      if (f) {
        out.push(`<div class="fact" data-reveal><span class="fact-label">${inline(f.label)}</span><p>${inline(f.rest)}</p></div>`);
      } else {
        out.push(`<p${leadPending ? ' class="lead-p"' : ''} data-reveal>${inline(text)}</p>`);
        leadPending = false;
      }
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
  return sections.map((s, i) => ({ title: s.title, html: renderBlocks(s.lines.join('\n'), i === 0) }));
}

/* ---------- shared pieces ---------- */

const arrow =
  '<svg class="arrow" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const arrowBig =
  '<svg class="arrow-big" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const iconSun =
  '<svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const iconMoon =
  '<svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

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

function footerHtml(full) {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="wrap">
${
  full
    ? `    <div class="footer-cta" data-reveal>
      <p class="footer-label">${esc(site.footer.label)}</p>
      <a class="footer-mail" href="mailto:${esc(site.email)}">${esc(site.email)}</a>
      <p class="footer-note">${esc(site.footerNote)}</p>
    </div>
`
    : ''
}    <div class="footer-bar">
      <span>© ${year} ${esc(site.name)}</span>
      <span>${esc(site.location)}</span>
      <span class="footer-links"><a href="${esc(site.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a><a href="#top">Back to top ↑</a></span>
    </div>
  </div>
</footer>`;
}

function layout({ title, description, path, active, body, footer = 'full' }) {
  const nav = (key, href, label) =>
    `<a class="nav-link${active === key ? ' is-active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
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
  (function () {
    var d = document.documentElement, t = null;
    d.classList.add('js');
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    d.setAttribute('data-theme', t);
    try { if (sessionStorage.getItem('curtain')) d.classList.add('curtain-in'); } catch (e) {}
  })();
</script>
<script src="/assets/main.js" defer></script>
</head>
<body id="top">
<div class="curtain" aria-hidden="true"></div>
<header class="site-header">
  <div class="wrap">
    <nav class="nav" aria-label="Main">
      ${nav('projects', '/', 'Projects')}
      ${nav('about', '/about/', 'About')}
      <div class="nav-end">
        <span class="status" title="${esc(site.status)}"><i class="status-dot" aria-hidden="true"></i><span class="status-text">${esc(site.status)}</span></span>
        <button class="theme-toggle" type="button" aria-label="Switch colour theme">${iconSun}${iconMoon}</button>
        <a class="btn nav-contact" href="/contact/"><span>Contact</span>${arrow}</a>
      </div>
    </nav>
  </div>
</header>
<main class="wrap stack" data-path="${esc(path)}">
${body}
</main>
${footerHtml(footer === 'full')}
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
      role: data.role || '',
      tools: data.tools || '',
      duration: data.duration || '',
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
      const sub = [p.type || p.category, p.year].filter(Boolean).join(' · ');
      const inner = `<span class="row-name">${esc(p.title)}</span><span class="row-cat">${esc(sub)}</span><span class="row-num">${pad2(i + 1)}</span>`;
      return p.page
        ? `<li data-reveal><a class="row" href="/projects/${p.slug}/"${preview}>${inner}</a></li>`
        : `<li data-reveal><div class="row row--static"${preview}>${inner}</div></li>`;
    })
    .join('\n');

  const feat =
    projects.find((p) => p.slug === site.home.featured && p.page && p.cover) ||
    projects.find((p) => p.page && p.cover);
  const featHtml = feat
    ? `<a class="feature" href="/projects/${feat.slug}/" aria-label="${esc(feat.title)}">
  <figure class="frame" data-reveal="clip">
    <img src="${esc(useImage(feat.cover))}" alt="${esc(feat.title)} — featured case" width="1388" height="615" fetchpriority="high">
    <figcaption class="feature-cap">
      <span class="feature-text">
        <span class="feature-label">${esc(site.home.featuredLabel)}</span>
        <span class="feature-title">${esc(feat.title)}</span>
        <span class="feature-meta">${esc([feat.type || feat.category, feat.year].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="feature-go">${arrowBig}</span>
    </figcaption>
  </figure>
</a>`
    : '';

  const group = (hidden) =>
    `<ul class="marquee-group"${hidden ? ' aria-hidden="true"' : ''}>${site.about.skills.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const marquee = `<div class="marquee" role="group" aria-label="Skills" data-reveal>
  <div class="marquee-track">${[0, 1, 2, 3, 4, 5].map((n) => group(n > 0)).join('')}</div>
</div>`;

  const body = `
<section class="hero">
  <h1 class="h1">${words(site.home.heroTitle)}</h1>
  <p class="lead" data-reveal>${esc(site.home.heroLead)}</p>
</section>
${featHtml}
${marquee}
<h2 class="h2" id="projects" data-reveal>${esc(site.home.projectsHeading)}</h2>
<ul class="project-list">
${rows}
</ul>
<div class="cta" data-reveal>
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
    ${button('/about/', c.button, { reveal: false })}
  </div>
</div>`;
  return layout({
    title: `Contact — ${site.name}`,
    description: c.lead,
    path: '/contact/',
    active: 'contact',
    footer: 'bar',
    body,
  });
}

function projectPage(p) {
  const meta = [
    ['Type', p.type],
    ['Year', p.year],
    ['Role', p.role || site.project.defaultRole],
    ['Tools', p.tools || site.project.defaultTools],
    ['Duration', p.duration],
  ].filter(([, v]) => v);
  const sections = renderSections(p.body);
  const idx = projects.findIndex((x) => x.slug === p.slug);
  const more = [];
  for (let i = 1; i < projects.length && more.length < 3; i++) {
    const q = projects[(idx + i) % projects.length];
    if (q.cover) more.push(q);
  }

  // Rhythm: one wide frame, then two side by side, then wide again, and so on.
  const zoomIcon =
    '<span class="frame-zoom" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const fig = (src, i, half) =>
    `<figure class="frame${half ? ' frame--half' : ''}" data-reveal="clip">${zoomIcon}<img src="${esc(useImage(src))}" alt="${esc(p.title)} — project image ${i + 1}" width="1388" height="615"${i ? ' loading="lazy"' : ''}></figure>`;
  const galleryParts = [];
  for (let i = 0, pair = false; i < p.images.length; pair = !pair) {
    if (pair && i + 1 < p.images.length) {
      galleryParts.push(`  <div class="gallery-pair">${fig(p.images[i], i, true)}${fig(p.images[i + 1], i + 1, true)}</div>`);
      i += 2;
    } else {
      galleryParts.push(`  ${fig(p.images[i], i, false)}`);
      i += 1;
    }
  }
  const gallery = galleryParts.length ? `<div class="gallery">\n${galleryParts.join('\n')}\n</div>` : '';

  let nextP = null;
  for (let i = 1; i < projects.length && !nextP; i++) {
    const q = projects[(idx + i) % projects.length];
    if (q.page) nextP = q;
  }
  const nextHtml = nextP
    ? `<a class="next" href="/projects/${nextP.slug}/" data-reveal>
  <span class="next-label">${esc(site.project.nextLabel)}</span>
  <span class="next-row"><span class="next-title">${esc(nextP.title)}</span>${arrowBig}</span>
  <span class="next-meta">${esc([nextP.type || nextP.category, nextP.year].filter(Boolean).join(' · '))}</span>
</a>`
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
    (s, i) =>
      `<section class="case"><div class="case-head" data-reveal><span class="case-idx">${pad2(i + 1)}</span>${s.title ? `<h2 class="h2 h2--section">${esc(s.title)}</h2>` : ''}</div>${s.html ? `<div class="case-body prose">${s.html}</div>` : ''}</section>`,
  )
  .join('\n')}
${nextHtml}
${moreHtml}`;

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
  return layout({ title: `Not found — ${site.name}`, description: site.description, path: '/404', active: null, body, footer: 'bar' });
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
