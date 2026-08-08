#!/usr/bin/env node
// Static checks over the seven pages.
//
//   node tools/check-pages.mjs
//
// Each page carries a <script type="text/x-dc"> logic block that the runtime
// compiles with new Function at mount time. Nothing parses it before then: it is
// not JavaScript as far as the browser is concerned, so a syntax error there is
// invisible until the page is opened, and it does not fail loudly — the
// component simply never mounts and the page renders as raw, unstyled template.
//
// That is exactly how a missing comma in renderVals took out three pages during
// the phase 4 copyright change. The browser reported no error; the only symptom
// was a mailto: link with no address.
//
// These checks are static and cheap, and cover the mistakes that are silent at
// runtime.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const pages = PAGES.map((f) => ({ file: f, html: readFileSync(join(ROOT, f), 'utf8') }));

// ===========================================================================
section('Logic blocks parse');

for (const { file, html } of pages) {
  const m = html.match(/data-dc-script[^>]*>\n([\s\S]*?)<\/script>/);
  if (!m) { check(`${file} has a logic block`, false); continue; }
  // `class Component extends DCLogic` needs the base class to exist before the
  // body will parse standalone.
  const src = 'class DCLogic {}\n' + m[1];
  let err = null;
  try { new Function(src); } catch (e) { err = e.message; }
  check(`${file} logic block parses`, err === null, err || '');
}

// ===========================================================================
section('Template interpolation resolves');

for (const { file, html } of pages) {
  const body = html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>'));
  const logic = (html.match(/data-dc-script[^>]*>\n([\s\S]*?)<\/script>/) || [, ''])[1];
  const props = (html.match(/data-props="([^"]*)"/) || [, ''])[1];

  // Literals, not names to resolve.
  const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'this']);

  const used = [...new Set([...body.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)].map((x) => x[1]))]
    .filter((n) => !LITERALS.has(n));

  const missing = used.filter((name) => {
    // renderVals supplies these as `name: value` or as ES6 shorthand `name,`
    if (new RegExp(`(^|[\\s{,])${name}\\s*:`, 'm').test(logic)) return false;
    if (new RegExp(`(^|[\\s{,])${name}\\s*[,}]`, 'm').test(logic)) return false;
    // …or it is a local binding the shorthand then returns
    if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(logic)) return false;
    if (props.includes(`&quot;${name}&quot;`)) return false;
    if (new RegExp(`as="${name}"`).test(body)) return false;   // <sc-for> loop variable
    return true;
  });
  check(`${file}: every {{ value }} has a source`, missing.length === 0, missing.join(', '));
}

// ===========================================================================
section('Shared resources are wired up');

for (const { file, html } of pages) {
  const head = html.slice(0, html.indexOf('</head>'));
  check(`${file} links site.css`, /href="\.\/site\.css\?v=\d+"/.test(head));
  check(`${file} loads site-data.js`, /src="\.\/site-data\.js\?v=\d+"/.test(head));
  check(`${file} carries a meta CSP`, /http-equiv="Content-Security-Policy"/.test(head));

  // resources.js must precede support.js or the vendored-React override is read
  // too late; site.css must precede both so it is not render-blocking mid-parse.
  const iCss = head.indexOf('site.css');
  const iRes = head.indexOf('resources.js');
  const iSup = head.indexOf('support.js');
  check(`${file} head order: site.css, resources.js, support.js`,
    iCss > -1 && iCss < iRes && iRes < iSup, `${iCss} / ${iRes} / ${iSup}`);
}

// ===========================================================================
section('No duplication regressions');

// These moved into site.css and site-data.js. A page redefining them locally
// means the extraction has started to unravel.
for (const { file, html } of pages) {
  check(`${file} does not redefine the shared preamble`,
    !html.includes('[data-bb-wordmark] {') && !html.includes('[data-bb-skiplink] {'));
  check(`${file} does not hardcode the contact address`,
    !/info@brisabay\.com/.test(html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>'))));
  check(`${file} does not hardcode a copyright year`, !/Brisa Bay 20\d\d/.test(html));
}

// ===========================================================================
section('Accessibility basics');

for (const { file, html } of pages) {
  // Strip <style> first: a CSS comment mentioning <h1> is not an element, and
  // counting it produced a false "two headings" failure.
  const body = html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>'))
    .replace(/<style>[\s\S]*?<\/style>/g, '');
  const h1s = (body.match(/<h1[\s>]/g) || []).length;
  check(`${file} has exactly one <h1>`, h1s === 1, `${h1s}`);
  check(`${file} has a skip link`, /data-bb-skiplink=""/.test(body));
  check(`${file} declares a language`, /<html lang="[a-z]{2}"/.test(html));
  const imgs = body.match(/<img\b[^>]*>/g) || [];
  check(`${file}: every <img> has alt`, imgs.every((t) => /\balt=/.test(t)),
    imgs.filter((t) => !/\balt=/.test(t)).length + ' without');
  check(`${file}: every <img> declares dimensions`,
    imgs.every((t) => /\bwidth=/.test(t) && /\bheight=/.test(t)) ||
    imgs.filter((t) => !/\bwidth=/.test(t)).every((t) => /\{\{/.test(t)),
    imgs.filter((t) => !/\bwidth=/.test(t) && !/\{\{/.test(t)).length + ' without');
}

// ===========================================================================
console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\nFAILED  ${fail} of ${pass + fail} checks`);
  process.exit(1);
}
console.log(`\nPASSED  ${pass} checks across ${pages.length} pages`);
