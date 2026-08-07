#!/usr/bin/env node
// Regression tests for age-gate.js.
//
//   node tools/test-age-gate.mjs
//
// The age gate is a legal compliance control for an alcohol brand and it had no
// tests at all, despite being genuinely intricate: localStorage persistence, a
// focus trap, a scroll lock that has to restore exactly what it replaced, and an
// `inert` polyfill for Safari before 15.5. It has already regressed once —
// commit 78dcf67, "Make the age gate actually gate".
//
// WHY A HAND-ROLLED DOM AND NOT JSDOM
// This repo has no package.json and no node_modules; the tools are plain .mjs
// run with node, and server.py has no pip dependencies either. Adding jsdom
// would mean introducing npm dependency management, a lockfile and a CI install
// step for one test file. The stub below is the subset of DOM that age-gate.js
// actually touches.
//
// It also buys something jsdom would make awkward: `inert` support is a plain
// property on the fake HTMLElement.prototype, so the Safari fallback path can be
// exercised directly instead of hoping the host lacks the feature.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

// --- the smallest DOM age-gate.js will accept -------------------------------

class El {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.focused = 0;
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  focus() { this.focused++; doc.activeElement = this; }
  /** Only the selectors age-gate.js actually passes. */
  querySelectorAll(sel) {
    const wantPrev = sel === '[data-bb-prev-tabindex]';
    return this.children.filter((c) => wantPrev ? c.hasAttribute('data-bb-prev-tabindex') : c.focusable);
  }
}

function makeDoc({ inertSupported }) {
  const HTMLElementPrototype = inertSupported ? { inert: undefined } : {};
  const html = new El('html');
  const body = new El('body');
  const main = new El('main');
  const footer = new El('footer');
  const skip = new El('a');
  const dialog = new El('div');
  const opener = new El('button');

  // Two focusables inside main: one with a pre-existing tabindex, one without,
  // so the fallback's save/restore is exercised in both shapes.
  const linkA = new El('a'); linkA.focusable = true;
  const linkB = new El('a'); linkB.focusable = true; linkB.setAttribute('tabindex', '3');
  main.children.push(linkA, linkB);

  const byId = { 'bb-content': main };
  const bySel = {
    '[role="contentinfo"]': footer,
    '[data-bb-skiplink]': skip,
    '[data-bb-age-gate]': dialog,
    '[data-bb-faq]': null,
    '[role="dialog"]': dialog
  };
  return {
    documentElement: html,
    body,
    activeElement: opener,
    hidden: false,
    getElementById: (id) => byId[id] ?? null,
    querySelector: (sel) => (sel in bySel ? bySel[sel] : null),
    _parts: { html, body, main, footer, skip, dialog, opener, linkA, linkB },
    _HTMLElementPrototype: HTMLElementPrototype,
    _bySel: bySel
  };
}

let doc;
function loadGate({ inertSupported = true, storageThrows = false } = {}) {
  doc = makeDoc({ inertSupported });
  const store = new Map();
  const win = {
    document: doc,
    HTMLElement: { prototype: doc._HTMLElementPrototype },
    localStorage: {
      getItem: (k) => { if (storageThrows) throw new Error('denied'); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { if (storageThrows) throw new Error('denied'); store.set(k, String(v)); }
    },
    setTimeout: (fn) => { fn(); return 0; }   // run deferred work immediately
  };
  const src = readFileSync(join(ROOT, 'age-gate.js'), 'utf8');
  new Function('window', 'document', 'HTMLElement', 'localStorage', 'setTimeout',
    'var globalThis = window; ' + src)
    (win, win.document, win.HTMLElement, win.localStorage, win.setTimeout);
  return { gate: win.BBAgeGate, win, store };
}

// ===========================================================================
section('Persistence');

{
  const { gate, store } = loadGate();
  check('readOk() is false before any choice', gate.readOk() === false);
  gate.writeOk();
  check('writeOk() persists under the documented key', store.get('bb-age-ok') === '1');
  check('readOk() is true afterwards', gate.readOk() === true);
  check('KEY is exported for callers', gate.KEY === 'bb-age-ok');
}
{
  // Safari private mode and cookie-blocking extensions both throw here. The gate
  // must fail closed — show the gate — rather than throw and blank the page.
  const { gate } = loadGate({ storageThrows: true });
  let threw = false;
  try { check('readOk() is false when storage throws', gate.readOk() === false); }
  catch { threw = true; }
  check('readOk() does not propagate a storage error', !threw);
  let threw2 = false;
  try { gate.writeOk(); } catch { threw2 = true; }
  check('writeOk() does not propagate a storage error', !threw2);
}

// ===========================================================================
section('Keyboard activation');

{
  const { gate } = loadGate();
  const seen = [];
  const handler = gate.activate(() => seen.push('fired'));
  let prevented = 0;
  const ev = (key) => ({ key, preventDefault: () => prevented++ });

  handler(ev('Enter'));
  check('Enter activates', seen.length === 1);
  handler(ev(' '));
  check('Space activates', seen.length === 2);
  handler(ev('Spacebar'));
  check('legacy "Spacebar" activates (older Safari/Edge)', seen.length === 3);
  check('activation prevents the default scroll/submit', prevented === 3);

  handler(ev('a'));
  handler(ev('Tab'));
  handler(ev('Escape'));
  check('other keys do not activate', seen.length === 3);
  handler(undefined);
  check('a missing event is ignored rather than throwing', seen.length === 3);
}

// ===========================================================================
section('Modal: inert, scroll lock, focus');

{
  const { gate } = loadGate({ inertSupported: true });
  const { main, footer, skip, dialog, opener, html, body } = doc._parts;
  const host = {};

  // Pre-existing values on BOTH elements — the lock saves and restores each
  // independently, so seeding only one leaves half the restore path untested.
  html.style.overflow = 'auto';
  body.style.overflow = 'scroll';

  gate.syncModal(host, { gateOpen: true });
  check('main is inert while the gate is up', main.inert === true);
  check('footer is inert while the gate is up', footer.inert === true);
  check('skip link is inert while the gate is up', skip.inert === true);
  check('html scroll is locked', html.style.overflow === 'hidden');
  check('body scroll is locked', body.style.overflow === 'hidden');
  check('the dialog is given a programmatic focus target', dialog.getAttribute('tabindex') === '-1');
  check('the dialog receives focus', dialog.focused === 1);

  gate.syncModal(host, { gateOpen: true });
  check('re-syncing the same state does not refocus', dialog.focused === 1);

  gate.syncModal(host, { gateOpen: false });
  check('main is no longer inert', main.inert === false);
  check('footer is no longer inert', footer.inert === false);
  check('html overflow is restored to its previous value', html.style.overflow === 'auto',
    `got ${JSON.stringify(html.style.overflow)}`);
  check('body overflow is restored to its previous value', body.style.overflow === 'scroll',
    `got ${JSON.stringify(body.style.overflow)}`);
  check('focus returns to whatever opened the modal', opener.focused === 1);
}

{
  // The FAQ modal shares the machinery.
  const { gate } = loadGate();
  const { main, dialog } = doc._parts;
  doc._bySel['[data-bb-faq]'] = dialog;
  const host = {};
  gate.syncModal(host, { faqOpen: true });
  check('FAQ open also traps the page', main.inert === true);
  gate.syncModal(host, { faqOpen: false });
  check('FAQ close releases it', main.inert === false);
}

{
  // Moving from the question to the "come back later" panel is still one modal.
  const { gate } = loadGate();
  const { dialog } = doc._parts;
  const host = {};
  gate.syncModal(host, { gateOpen: true, gateDenied: false });
  const afterOpen = dialog.focused;
  gate.syncModal(host, { gateOpen: true, gateDenied: true });
  check('denied panel is treated as a state change, not a new modal',
    dialog.focused === afterOpen + 1);
}

// ===========================================================================
section('Safari < 15.5 fallback (no inert)');

{
  const { gate } = loadGate({ inertSupported: false });
  const { main, linkA, linkB } = doc._parts;
  const host = {};

  gate.syncModal(host, { gateOpen: true });
  check('container is hidden from assistive tech', main.getAttribute('aria-hidden') === 'true');
  check('focusable without tabindex is taken out of the tab order',
    linkA.getAttribute('tabindex') === '-1');
  check('focusable with tabindex is taken out of the tab order',
    linkB.getAttribute('tabindex') === '-1');
  check('the previous tabindex is remembered',
    linkB.getAttribute('data-bb-prev-tabindex') === '3');
  check('an absent tabindex is remembered as empty',
    linkA.getAttribute('data-bb-prev-tabindex') === '');

  gate.syncModal(host, { gateOpen: false });
  check('aria-hidden is removed on close', main.getAttribute('aria-hidden') === null);
  check('a previously absent tabindex is removed, not left at -1',
    linkA.getAttribute('tabindex') === null, `got ${linkA.getAttribute('tabindex')}`);
  check('an existing tabindex is restored to its old value',
    linkB.getAttribute('tabindex') === '3', `got ${linkB.getAttribute('tabindex')}`);
  check('the bookkeeping attribute is cleaned up',
    !linkA.hasAttribute('data-bb-prev-tabindex') && !linkB.hasAttribute('data-bb-prev-tabindex'));
}

// ===========================================================================
section('cleanupModal');

{
  // A remount must never leave the page inert or unscrollable — that is a
  // whole-page lockout, the worst failure this module can produce.
  const { gate } = loadGate();
  const { main, footer, html, body } = doc._parts;
  const host = {};
  gate.syncModal(host, { gateOpen: true });
  gate.cleanupModal(host);
  check('cleanup releases inert', main.inert === false && footer.inert === false);
  check('cleanup releases the scroll lock',
    html.style.overflow === '' && body.style.overflow === '');
  check('cleanup clears the modal bookkeeping', host._bbModalKey === null);
  check('cleanup clears the stored focus target', host._bbReturnFocus === null);

  gate.cleanupModal(host);
  check('cleanup is idempotent', main.inert === false && html.style.overflow === '');
  let threw = false;
  try { gate.cleanupModal(null); } catch { threw = true; }
  check('cleanup tolerates a missing host', !threw);
}

// ===========================================================================
console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\nFAILED  ${fail} of ${pass + fail} assertions`);
  process.exit(1);
}
console.log(`\nPASSED  ${pass} assertions`);
