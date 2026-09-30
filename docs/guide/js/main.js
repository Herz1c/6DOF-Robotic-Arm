// The guide itself: where the reader is, what the panel says, and the controls.
// All robot facts come from data/guide.json; scene.js draws them.

import { Scene3D } from './scene.js';
import { STR, fmt } from './i18n.js';

const STORE = 'robotarm6dof.guide.v1';
const $ = (id) => document.getElementById(id);

const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M4 12h14M13 6l6 6-6 6"/>',
};
const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// part codes, screw sizes and axis names stand out in running text
const TOKEN = /(P\d{3}[A-Z]?(?![A-Za-z0-9])|M\d+(?:[.,]\d+)?\s?[x×]\s?\d+(?:[.,]\d+)?|M\d+(?![A-Za-z0-9×])|\(\s*[±+−-]\s*[XYZ]\s*\)|[±+−-][XYZ](?![A-Za-z]))/g;

const state = {
  guide: null, n: 1, intro: null,
  lang: 'cs', theme: 'light', text: 1,
  mode: 'detail', xray: false, loop: false, lock: false, wake: false,
  done: new Set(),
};
let scene = null;
let wakeLock = null;
let toastTimer = 0;

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

function marked(text) {
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    // an axis in brackets becomes the chip itself, minus sign and all
    const shown = match[0].replace(/[()\s]/g, '').replace(/^-(?=[XYZ])/, '−');
    fragment.append(text.slice(last, match.index), h('span', { class: 'tok' }, shown));
    last = match.index + match[0].length;
  }
  fragment.append(text.slice(last));
  return fragment;
}

// ---- remembering ----------------------------------------------------------

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      step: state.guide.steps[state.n - 1].id, intro: state.intro,
      lang: state.lang, theme: state.theme, text: state.text,
      loop: state.loop, lock: state.lock, wake: state.wake,
      done: [...state.done],
    }));
  } catch { /* private window or storage off: the guide works without it */ }
}

// ---- where the reader is --------------------------------------------------

const L = () => STR[state.lang];
const step = (n = state.n) => state.guide.steps[n - 1];
const chapterAt = () => state.guide.chapters[state.intro ?? step().ch];

function go(target, { animate = true, instant = false } = {}) {
  const total = state.guide.steps_total;
  if (target.intro !== undefined && target.intro !== null) {
    state.intro = Math.max(0, Math.min(state.guide.chapters.length - 1, target.intro));
    state.n = state.guide.chapters[state.intro].first;
    scene.showChapter(state.intro, { instant });
  } else {
    state.intro = null;
    state.n = Math.max(1, Math.min(total, target.n));
    scene.show(state.n, { animate, instant });
  }
  const hash = state.intro !== null ? `#kapitola-${state.intro + 1}` : `#${step().id}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  save();
  render();
  $('panel').scrollTop = 0;
}

function next() {
  if (state.intro !== null) { go({ n: state.n }); return; }
  state.done.add(step().id);
  if (state.n >= state.guide.steps_total) { save(); render(); toast(L().finished); return; }
  const upcoming = step(state.n + 1);
  // a new area of the robot starts with its overview, as the PDF does
  if (upcoming.ch !== step().ch) go({ intro: upcoming.ch });
  else go({ n: state.n + 1 });
}

function back() {
  if (state.intro !== null) {
    if (state.n > 1) go({ n: state.n - 1 });
    return;
  }
  if (state.n === state.guide.chapters[step().ch].first) go({ intro: step().ch });
  else go({ n: state.n - 1 });
}

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const chapter = /^(?:kapitola|chapter)-(\d+)$/.exec(hash);
  if (chapter) return { intro: Number(chapter[1]) - 1 };
  const found = state.guide.steps.find((entry) => entry.id === hash);
  return found ? { n: found.n } : null;
}

// ---- drawing the page -----------------------------------------------------

function render() {
  const words = L();
  const chapter = chapterAt();
  document.documentElement.lang = state.lang;
  document.title = words.docTitle;
  $('chapter-name').textContent = chapter[state.lang].label;
  $('counter').textContent = state.intro !== null
    ? `${words.steps} ${chapter.first}–${chapter.last}`
    : `${words.step} ${state.n} / ${state.guide.steps_total}`;
  $('back').innerHTML = `${icon('left')}<span>${words.back}</span>`;
  const last = state.intro === null && state.n >= state.guide.steps_total;
  const label = state.intro !== null ? words.startChapter : last ? words.finish : words.next;
  $('next').innerHTML = `<span>${label}</span>${last ? '' : icon('right')}`;
  $('back').style.visibility = state.intro !== null && state.n === 1 ? 'hidden' : '';
  $('scrub').value = state.n;
  $('view-tools').style.visibility = state.intro !== null ? 'hidden' : '';
  for (const button of $('lang').children) button.setAttribute('aria-pressed', button.dataset.lang === state.lang);
  const names = { detail: words.modeDetail, whole: words.modeWhole, part: words.modePart };
  const brief = { detail: words.modeDetail, whole: words.modeWholeShort, part: words.modePartShort };
  for (const button of $('modes').children) {
    button.replaceChildren(h('span', { class: 'long' }, names[button.dataset.mode]),
      h('span', { class: 'short' }, brief[button.dataset.mode]));
    button.setAttribute('aria-label', names[button.dataset.mode]);
    button.setAttribute('aria-pressed', button.dataset.mode === state.mode);
  }
  $('xray').setAttribute('aria-pressed', state.xray);
  labelled('open-drawer', words.chapters, 'menu');
  labelled('open-settings', words.settings, 'sliders');
  labelled('close-drawer', words.close, 'close');
  labelled('replay', words.replay, 'replay');
  labelled('xray', words.xray, 'eye');
  labelled('home-view', words.homeView, 'home');
  $('search').placeholder = words.search;
  $('panel').replaceChildren(state.intro !== null ? chapterPanel() : stepPanel());
}

function labelled(id, text, name) {
  const node = $(id);
  node.setAttribute('aria-label', text);
  node.title = text;
  if (!node.firstChild) node.innerHTML = icon(name);
}

function stepPanel() {
  const words = L();
  const entry = step();
  const text = entry[state.lang];
  const chapter = state.guide.chapters[entry.ch];
  const roles = state.guide.roles;
  const box = h('div', { class: 'step' });
  box.append(
    h('div', { class: 'kicker' }, `${words.step} ${entry.n} / ${state.guide.steps_total} · ${chapter[state.lang].label}`),
    h('h1', { class: 'title' }, marked(text.title)));
  const pills = h('div', { class: 'pills' }, h('span', { class: 'pill qty' }, text.qty));
  if (text.tool) pills.append(h('span', { class: 'pill tool' }, text.tool));
  for (const role of entry.roles) {
    pills.append(h('span', { class: 'pill' }, h('i', { style: `background:${roles[role].color}` }), roles[role][state.lang]));
  }
  box.append(pills);
  if (entry.bench) {
    box.append(h('div', { class: 'bench' }, words.bench,
      entry.joins ? ` ${fmt(words.benchJoins, entry.joins)}` : ''));
  }
  if (entry.moves) {
    box.append(h('div', { class: 'bench' },
      fmt(words.moves, `${entry.moves[0]}–${entry.moves[entry.moves.length - 1]}`)));
  }
  box.append(h('h2', {}, words.whatToDo), h('p', { class: 'op' }, marked(text.op)));
  box.append(h('p', { class: 'dir' }, h('span', { html: icon('arrow') }), `${words.direction}: `, marked(text.dir)));
  for (const note of text.notes) box.append(h('div', { class: 'note' }, marked(note)));
  box.append(h('div', { class: 'check' }, h('h2', {}, words.check), h('p', {}, marked(text.check))));
  if (entry.files) {
    const files = h('div', { class: 'files' }, `${words.printFile}: `);
    entry.files.forEach((file, index) => {
      if (index) files.append(', ');
      files.append(h('a', {
        href: `${state.guide.repo}/blob/main/print_parts/${file}.stl`, target: '_blank', rel: 'noopener',
      }, `${file}.stl`));
    });
    box.append(files);
  }
  return box;
}

function chapterPanel() {
  const words = L();
  const chapter = chapterAt();
  const text = chapter[state.lang];
  const box = h('div', { class: 'intro' });
  box.append(
    h('div', { class: 'kicker' }, `${words.chapter} ${chapter.i + 1} / ${state.guide.chapters.length} · ${words.steps} ${chapter.first}–${chapter.last}`),
    h('h1', { class: 'title' }, text.label),
    h('p', { class: 'op' }, text.blurb));
  const saved = load();
  if (chapter.i === 0 && saved.step && saved.step !== state.guide.steps[0].id) {
    const resume = state.guide.steps.find((entry) => entry.id === saved.step);
    if (resume) {
      box.append(h('div', { class: 'row-buttons' }, h('button', {
        class: 'btn small', type: 'button', onclick: () => go({ n: resume.n }),
      }, fmt(words.resume, resume.n))));
    }
  }
  const listed = (items) => h('ul', { class: 'kit' }, ...items.map((item) => h('li', {},
    h('span', { class: 'n' }, String(item.n)),
    h('button', { type: 'button', onclick: () => go({ n: item.n }) }, marked(item.title)))));
  box.append(h('h2', {}, words.prepare));
  if (text.printed.length) box.append(h('h3', {}, `${words.printed} (${text.printed.length})`), listed(text.printed));
  if (text.fasteners.length) {
    box.append(h('h3', {}, words.fasteners), h('ul', { class: 'kit columns' }, ...text.fasteners.map((item) =>
      h('li', {}, h('span', {}, item.name), h('span', { class: 'count' }, `${item.count}×`)))));
  }
  if (text.bought.length) box.append(h('h3', {}, `${words.bought} (${text.bought.length})`), listed(text.bought));
  if (text.tools.length) box.append(h('h3', {}, words.tools), h('p', {}, text.tools.join(', ')));
  if (chapter.i === 0) {
    box.append(h('div', { class: 'help' },
      h('h2', {}, words.helpTitle),
      h('p', {}, matchMedia('(pointer: coarse)').matches ? words.helpTouch : words.helpMouse),
      h('p', {}, words.helpKeys)));
    box.append(h('p', { class: 'caution' }, words.notBuilt, ' ',
      h('a', { href: state.guide.manual[state.lang], target: '_blank', rel: 'noopener' }, words.manual)));
  }
  return box;
}

// ---- chapters and search --------------------------------------------------

function drawer(open) {
  $('drawer').hidden = !open;
  $('shade').hidden = !open && $('settings').hidden;
  if (open) { $('search').value = ''; fillDrawer(''); }
}

function fillDrawer(query) {
  const words = L();
  const body = $('drawer-body');
  const needle = query.trim().toLowerCase();
  const link = (entry) => h('button', {
    type: 'button',
    class: `step-link${entry.n === state.n && state.intro === null ? ' here' : ''}${state.done.has(entry.id) ? ' done' : ''}`,
    onclick: () => { drawer(false); go({ n: entry.n }); },
  }, h('span', { class: 'n' }, String(entry.n)), h('span', {}, entry[state.lang].title));
  if (needle) {
    const hits = state.guide.steps.filter((entry) => {
      const text = entry[state.lang];
      return `${entry.n} ${text.title} ${text.op} ${entry.id}`.toLowerCase().includes(needle);
    });
    body.replaceChildren(...(hits.length ? hits.slice(0, 80).map(link) : [h('p', { class: 'empty' }, words.noMatch)]));
    return;
  }
  const here = chapterAt().i;
  body.replaceChildren(...state.guide.chapters.map((chapter) => {
    const members = state.guide.steps.slice(chapter.first - 1, chapter.last);
    const finished = members.filter((entry) => state.done.has(entry.id)).length;
    return h('details', { open: chapter.i === here },
      h('summary', { class: chapter.i === here ? 'here' : '' },
        h('span', {}, chapter[state.lang].label),
        h('span', { class: 'range' }, `${chapter.first}–${chapter.last} · ${finished}/${members.length}`)),
      h('button', {
        type: 'button', class: 'step-link overview',
        onclick: () => { drawer(false); go({ intro: chapter.i }); },
      }, h('span', { class: 'n' }, '•'), h('span', {}, words.overview)),
      ...members.map(link));
  }));
  body.querySelector('.here')?.scrollIntoView({ block: 'center' });
}

// ---- settings -------------------------------------------------------------

function settings(open) {
  const sheet = $('settings');
  sheet.hidden = !open;
  $('shade').hidden = !open && $('drawer').hidden;
  if (!open) return;
  const words = L();
  const toggle = (label, on, apply) => h('label', {}, label, h('input', {
    type: 'checkbox', checked: on,
    onchange: (event) => { apply(event.target.checked); save(); },
  }));
  const sizes = h('div', { class: 'seg' }, ...['A−', 'A', 'A+'].map((label, index) => h('button', {
    type: 'button', 'aria-pressed': String(state.text === index),
    onclick: () => { state.text = index; applyLook(); save(); settings(true); },
  }, label)));
  sheet.replaceChildren(
    h('h2', {}, words.settings),
    toggle(words.theme, state.theme === 'dark', (on) => { state.theme = on ? 'dark' : 'light'; applyLook(); }),
    toggle(words.loop, state.loop, (on) => { state.loop = on; scene.setLoop(on); }),
    toggle(words.lock, state.lock, (on) => { state.lock = on; scene.setLock(on); }),
    toggle(words.wake, state.wake, (on) => { state.wake = on; applyWake(); }),
    h('div', { class: 'row' }, words.textSize, sizes),
    h('div', { class: 'row' }, h('button', {
      class: 'btn small', type: 'button',
      onclick: () => { state.done.clear(); save(); toast(words.resetDone); },
    }, words.reset)),
    h('a', { href: state.guide.manual[state.lang], target: '_blank', rel: 'noopener' }, words.manual));
}

function applyLook() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.text = String(state.text);
  scene?.setTheme(state.theme);
}

async function applyWake() {
  try {
    if (state.wake && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else { await wakeLock?.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}

function toast(text) {
  const node = $('toast');
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 3200);
}

// ---- wiring ---------------------------------------------------------------

function ticks() {
  const total = state.guide.steps_total;
  $('scrub').max = total;
  $('ticks').replaceChildren(...state.guide.chapters.slice(1).map((chapter) =>
    h('i', { style: `left:${((chapter.first - 1) / (total - 1)) * 100}%` })));
}

function bind() {
  $('next').addEventListener('click', next);
  $('back').addEventListener('click', back);
  $('open-drawer').addEventListener('click', () => drawer(true));
  $('chapter-name').addEventListener('click', () => drawer(true));
  $('close-drawer').addEventListener('click', () => drawer(false));
  $('open-settings').addEventListener('click', () => settings($('settings').hidden));
  $('shade').addEventListener('click', () => { drawer(false); settings(false); });
  $('search').addEventListener('input', (event) => fillDrawer(event.target.value));
  $('replay').addEventListener('click', () => scene.play());
  $('home-view').addEventListener('click', () => scene.resetView());
  $('xray').addEventListener('click', () => { state.xray = !state.xray; scene.setXray(state.xray); render(); });
  for (const button of $('modes').children) {
    button.addEventListener('click', () => { state.mode = button.dataset.mode; scene.setMode(state.mode); render(); });
  }
  for (const button of $('lang').children) {
    button.addEventListener('click', () => { state.lang = button.dataset.lang; save(); render(); });
  }
  const scrub = $('scrub');
  const out = $('scrub-out');
  scrub.addEventListener('input', () => {
    const entry = step(Number(scrub.value));
    out.hidden = false;
    out.textContent = `${entry.n} · ${entry[state.lang].title}`;
    out.style.left = `${((entry.n - 1) / (state.guide.steps_total - 1)) * 100}%`;
  });
  scrub.addEventListener('change', () => { out.hidden = true; go({ n: Number(scrub.value) }); });
  window.addEventListener('hashchange', () => { const target = route(); if (target) go(target); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') applyWake(); });
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') { drawer(false); settings(false); return; }
    if (!$('drawer').hidden || !$('settings').hidden) return;
    // a focused button answers Space and Enter itself; acting here too would step twice
    if ((key === ' ' || key === 'enter') && event.target.closest('button, a, summary')) return;
    const modes = { 1: 'detail', 2: 'whole', 3: 'part' };
    if (key === 'arrowright' || key === ' ' || key === 'enter') { event.preventDefault(); next(); }
    else if (key === 'arrowleft') { event.preventDefault(); back(); }
    else if (key === 'r') scene.play();
    else if (key === 'h') scene.resetView();
    else if (key === 'x') $('xray').click();
    else if (modes[key]) { state.mode = modes[key]; scene.setMode(state.mode); render(); }
  });
}

function progress({ loaded, total, stepReady, allReady }) {
  const node = $('loading');
  node.hidden = allReady;
  if (allReady) return;
  const words = L();
  node.textContent = stepReady
    ? `${words.loadingRest} ${Math.round((loaded / total) * 100)} %`
    : `${words.loading}…`;
}

function viewNote(text, retry) {
  const node = $('view-note');
  node.hidden = false;
  node.replaceChildren(text);
  if (retry) {
    node.append(h('div', {}, h('button', {
      class: 'btn small', type: 'button',
      onclick: () => { node.hidden = true; scene.retry(); },
    }, L().retry)));
  }
}

async function boot() {
  const saved = load();
  state.lang = saved.lang || (/^(cs|sk)/i.test(navigator.language || '') ? 'cs' : 'en');
  state.theme = saved.theme || 'light';
  state.text = Number.isInteger(saved.text) ? saved.text : 1;
  state.loop = !!saved.loop;
  state.lock = !!saved.lock;
  state.wake = !!saved.wake;
  state.done = new Set(saved.done || []);
  applyLook();

  const response = await fetch('data/guide.json');
  if (!response.ok) throw new Error(`guide.json: HTTP ${response.status}`);
  state.guide = await response.json();

  scene = new Scene3D($('viewport'), state.guide, {
    onProgress: progress,
    onLoadError: () => viewNote(L().loadFailed, true),
    onUnsupported: () => viewNote(L().webglMissing, false),
  });
  scene.setTheme(state.theme);
  scene.loop = state.loop;
  scene.lock = state.lock;
  if (!scene.ok) { $('view-tools').hidden = true; $('loading').hidden = true; }

  ticks();
  bind();
  applyWake();
  const first = route() || (saved.step && saved.intro == null
    ? { n: state.guide.steps.find((entry) => entry.id === saved.step)?.n || 1 }
    : { intro: saved.intro ?? 0 });
  go(first, { instant: true });
  window.guide = { state, scene, go, next, back };
  if (new URLSearchParams(location.search).has('selftest')) selftest();
}

// Walks every chapter overview and every step and reports what it found; run
// with ?selftest and read window.guideSelftest.
async function selftest() {
  const frame = () => new Promise((resolve) => { scene.renderNow(); setTimeout(resolve, 0); });
  const report = { steps: 0, empty: [], slow: [], maxDrawCalls: 0, maxTriangles: 0, errors: [] };
  window.addEventListener('error', (event) => report.errors.push(String(event.message)));
  while (scene.ok && !scene.packState.every((value) => value === 'ready' || value === 'failed')) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  report.packs = scene.packState.slice();
  scene.setMode('whole');
  for (const chapter of state.guide.chapters) { go({ intro: chapter.i }, { instant: true }); await frame(); }
  for (const entry of state.guide.steps) {
    const started = performance.now();
    go({ n: entry.n }, { animate: false, instant: true });
    await frame();
    const stats = scene.stats();
    report.steps += 1;
    if (!stats.objects.current) report.empty.push(entry.n);
    report.maxDrawCalls = Math.max(report.maxDrawCalls, stats.drawCalls);
    report.maxTriangles = Math.max(report.maxTriangles, stats.triangles);
    const took = performance.now() - started;
    if (took > 120) report.slow.push([entry.n, Math.round(took)]);
    if (!$('panel').querySelector('.title')?.textContent) report.errors.push(`step ${entry.n}: empty panel`);
  }
  scene.setMode('detail');
  report.finished = true;
  window.guideSelftest = report;
  document.body.dataset.selftest = JSON.stringify(report);
}

boot().catch((error) => {
  document.body.append(h('pre', { style: 'position:fixed;inset:auto 0 0 0;margin:0;padding:12px;background:#fff;color:#a00;z-index:99' },
    `${error.message}`));
  throw error;
});
