# Portfolio — notes for Claude

Static portfolio site, zero npm dependencies. `node scripts/build.mjs` reads `content/` and `public/` and writes `dist/`. Deployed from GitHub (Vercel/Netlify, build command `node scripts/build.mjs`, output `dist`). The owner speaks Ukrainian; reply in Ukrainian.

## Adding a project (the usual request)

1. Create `content/projects/<slug>.md` (copy `healix.md` as the template). Frontmatter: `title`, `order` (position in the home list; numbers 01.. are generated from it), `category`, `type`, `year`, `summary`, `page` (false = listed on home but no case study page), `previewUrl` (optional "Watch Preview" button), `cover` (image for the "More Cases" cards; defaults to the first gallery image), `images` (gallery list).
2. Body is markdown: each `## Heading` becomes a case-study section. Supported: paragraphs, `- ` lists, `**bold**`, `[links](https://…)`.
3. Images go to `public/images/projects/<slug>/` and are referenced as `/images/projects/<slug>/01.webp`. Figma PNG exports should be converted to WebP (Pillow, quality ~84, 1388px wide is enough) before committing.
4. Run `node scripts/build.mjs`. It warns about every referenced image that is missing from `public/`.
5. Commit and push. The host rebuilds automatically.

Motion: `public/assets/main.js` + the "Motion" section at the bottom of `style.css`. Elements animate in when they carry `data-reveal` (set in the templates in `scripts/build.mjs`); headings use the `words()` helper. Page transitions use the `.curtain` overlay. Everything is gated on `html.js` and `prefers-reduced-motion`.

Site-wide copy (hero, about, experience, skills, contact, button labels) lives in `content/site.json`. Styles are in `public/assets/style.css`. Page templates are in `scripts/build.mjs`.

## Environment limits seen so far

- The workspace could not reach `www.figma.com` (policy 403), so Figma image assets could not be downloaded from the shell. Images have to be exported from Figma by the owner or added to the repo directly.
- `npm install` was not possible in the first session (registry unreachable), which is why the generator has no dependencies. Keep it that way unless the situation changes.
