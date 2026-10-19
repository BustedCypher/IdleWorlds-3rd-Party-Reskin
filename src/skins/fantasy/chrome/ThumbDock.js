/**
 * Owned navigation proxies: React retains every source node and handler.
 * Shadow roots keep the native port's classifiers/button plates out of the
 * dock. The existing Fantasy watcher is the only observer; no polling.
 */
import { ownerOf, mark, unmark, norm } from '../core/dom.js';
import { isRendered } from '../core/Viewport.js';
import { isRuntimeActive, guard } from '../core/Runtime.js';
import { rewriteAssetUrls } from '../core/StyleInjector.js';
import dockCss from '../styles/thumb-dock.css';

const HOST = 'data-iw-fantasy-nav-host';
const SOURCE = 'data-iw-fantasy-nav-source';
const SHELL = 'data-iw-fantasy-nav-shell';
const OWNED = 'data-iw-fantasy-navigation-owned';
const own = ownerOf(OWNED);
const PRIMARY = ['game', 'market', 'village', 'guild'];
const DESKTOP_PRIMARY = ['game', 'market', 'village', 'dungeon', 'guild', 'leaderboards'];
const NAMES = { game: 'Game', market: 'Market', village: 'Village', dungeon: 'Dungeon', guild: 'Guild', leaderboards: 'Leaderboards' };
const PATHS = {
  game: ['m14 3 7 7', 'm3 14 7 7', 'm4 3 17 18', 'm3 4 4-1-1 4', 'm20 3 1 4-4-1', 'm21 4-7 7', 'm4 21 7-7'],
  market: ['M3 10h18l-2-6H5z', 'M5 10v10h14V10', 'M9 20v-6h6v6', 'M8 4v6m8-6v6'],
  village: ['M4 21V7h4v4h3V7h2v4h3V7h4v14z', 'M10 21v-5a2 2 0 0 1 4 0v5', 'M4 3v4m4-4v4m8-4v4m4-4v4'],
  dungeon: ['M6 21V6a6 6 0 0 1 12 0v15', 'M3 21h18', 'M9 21V9h6v12', 'M13 15h.01'],
  guild: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z', 'm8 12 3 3 5-6'],
  leaderboards: ['M8 3h8v7a4 4 0 0 1-8 0z', 'M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4', 'M12 14v6m-4 1h8'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  presence: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M17 4a4 4 0 0 1 0 8m5 9v-2a4 4 0 0 0-3-4'],
  toolkit: ['M14 3h7v7m0-7L10 14', 'M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6'],
  utility: ['M12 3v2m0 14v2M3 12h2m14 0h2M6 6l1.5 1.5m9 9L18 18M6 18l1.5-1.5m9-9L18 6', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
};
let nav = null;
let hosts = [];
let sources = new Map();
let marked = new Set();
let shell = null;

function set(el, key, value) {
  if (value == null) { if (el.hasAttribute(key)) el.removeAttribute(key); }
  else if (el.getAttribute(key) !== String(value)) el.setAttribute(key, String(value));
}

function icon(key) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute(OWNED, '1'); svg.setAttribute('data-iw-fantasy-owned', '1');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': key === 'more' ? 4 : 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value);
  for (const d of PATHS[key] || PATHS.utility) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute(OWNED, '1'); path.setAttribute('data-iw-fantasy-owned', '1');
    path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}

function routeKey(el) {
  const key = el.getAttribute('data-iw-tab');
  if (NAMES[key]) return key;
  const text = norm(el.textContent).replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
  return text.match(/^(game|market|village|dungeon|guild|leaderboards)(?=$|[^a-z])/i)?.[1] || null;
}

function resolveNav() {
  const candidates = new Set([...document.querySelectorAll('[data-iw-ui="nav-tab"]')]
    .map(b => b.closest('[data-iw-chrome="nav"],[data-iw-ui="main-nav"]') || b.parentElement));
  // A mirrored source is intentionally hidden; its live parent (which still
  // contains our desktop host) distinguishes it from the responsive duplicate.
  return [...candidates].find(el => (el.getAttribute(SOURCE) === 'nav' ? isRendered(el.parentElement) : isRendered(el)) &&
    new Set([...el.querySelectorAll('a,button,[role="tab"]')].map(routeKey).filter(Boolean)).size >= 4) || null;
}

function disabled(el) { return !!el.disabled || el.getAttribute('aria-disabled') === 'true' || !!el.closest('fieldset[disabled]'); }

function entry(el, key, text) {
  return { key, el, text: text || norm(el.textContent) || el.getAttribute('aria-label') || el.title,
    href: el.matches('a[href]') ? el.href : null, disabled: disabled(el), checkbox: el.matches('input[type="checkbox"]') };
}

function readModel(source) {
  if (source.querySelector('input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[role="button"]:not(button),[role="link"]:not(a),[tabindex]:not(button):not(a):not([role="tab"])')) return null; // unfamiliar interaction: keep native
  const controls = [...source.querySelectorAll('a,button,[role="tab"]')];
  const entries = controls.map((el, i) => entry(el, routeKey(el) || (el.getAttribute('data-iw-nav-link') === 'toolkit' ? 'toolkit' : `extra-${i}`)));
  if (entries.some(e => !e.text)) return null;
  const context = source.closest('[data-iw-chrome="shell"]') || source.parentElement;
  const presence = context.querySelector('[data-iw-zone-link]');
  const theme = context.querySelector('[data-iw-theme-toggle] input[type="checkbox"]');
  const settings = [...context.querySelectorAll('[data-iw-header="utility-button"]')]
    .find(el => /settings/i.test(el.getAttribute('aria-label') || el.title || ''));
  if (presence) entries.push(entry(presence, 'presence', 'Who’s here?'));
  if (theme) entries.push(entry(theme, 'themes', 'Zone themes'));
  if (settings) entries.push(entry(settings, 'settings', 'Settings'));
  const routeOf = value => String(value).toLowerCase().split(/[^a-z0-9-]+/)
    .map(key => key === 'housing' ? 'village' : key).find(key => NAMES[key]);
  const route = routeOf(location.pathname) || routeOf(location.hash) || (!location.hash && location.pathname === '/' ? 'game' : null);
  const active = entries.find(e => e.key === route)?.key || entries.find(e => e.el.matches('[aria-current="page"],[aria-selected="true"],[data-iw-state="active"],.bg-ember,[class*="bg-orange"],[class*="bg-amber"]'))?.key;
  return { entries, active, presence, theme };
}

function releaseFocus(view) {
  if (!view.dialog.open) return;
  view.dialog.close();
  set(view.more, 'aria-expanded', 'false');
}

function activate(event, key) {
  const requestedChecked = event.target.matches?.('input[type="checkbox"]') ? event.target.checked : null;
  // Re-resolve first: a SPA swap or a breakpoint may have replaced the source
  // since the last frame. Never send a click to a detached old control.
  navigationPass();
  const source = sources.get(key);
  if (!source || !source.el.isConnected || source.disabled) { event.preventDefault(); return; }
  const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1;
  if (source.href && modified) return; // real proxy anchors preserve native link gestures
  event.preventDefault();
  if (source.checkbox) {
    // A storage/native update can race this click. Honor the value the user
    // requested, rather than blindly reversing the latest native value.
    if (source.el.checked !== requestedChecked) source.el.click();
    navigationPass();
    return;
  }
  for (const view of hosts) releaseFocus(view);
  source.el.click();
  navigationPass(); // checkbox / native data-iw-* changes need no DOM mutation
}

function control(item) {
  if (item.checkbox) {
    const label = own('label', 'theme-row');
    label.append(own('span', '', item.text));
    const input = own('input'); input.type = 'checkbox';
    input.addEventListener('change', event => guard('navigation:theme', () => activate(event, item.key)));
    label.append(input); label.iwfControl = input; return label;
  }
  const button = own(item.href ? 'a' : 'button', 'destination');
  if (!item.href) button.type = 'button';
  button.append(icon(item.key), own('span', 'destination-label', item.text));
  button.addEventListener('click', event => guard('navigation:activate', () => activate(event, item.key)));
  // A disabled anchor must not navigate on middle-click either.
  button.addEventListener('auxclick', event => { if (sources.get(item.key)?.disabled) event.preventDefault(); });
  button.iwfControl = button;
  return button;
}

function updateControl(node, item, active) {
  const button = node.iwfControl;
  set(button, 'data-destination', item.key);
  set(button, 'aria-disabled', item.disabled ? 'true' : null);
  set(button, 'aria-label', item.el.getAttribute('aria-label'));
  set(button, 'aria-description', item.el.getAttribute('aria-description'));
  set(button, 'title', item.el.getAttribute('title') || (item.checkbox ? item.el.closest('label')?.getAttribute('title') : null));
  if ('disabled' in button && button.disabled !== item.disabled) button.disabled = item.disabled;
  if (item.checkbox) { if (button.checked !== item.el.checked) button.checked = item.el.checked; return; }
  const text = button.querySelector('.destination-label');
  if (text.textContent !== item.text) text.textContent = item.text;
  set(button, 'aria-current', active ? 'page' : null);
  if (item.href) {
    set(button, 'href', item.href);
    for (const key of ['target', 'rel', 'download', 'referrerpolicy']) set(button, key, item.el.getAttribute(key));
  }
}

function syncGroup(container, items, active) {
  const old = new Map([...container.children].map(n => [n.iwfControl?.getAttribute('data-destination'), n]));
  const wanted = new Set();
  items.forEach((item, index) => {
    let node = old.get(item.key);
    if (node && node.iwfControl.tagName !== (item.checkbox ? 'INPUT' : item.href ? 'A' : 'BUTTON')) { node.remove(); node = null; }
    if (!node) node = control(item);
    updateControl(node, item, item.key === active);
    if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
    wanted.add(node);
  });
  for (const node of [...container.children]) if (!wanted.has(node)) node.remove();
}

function openMenu(view) {
  navigationPass();
  if (!view.host.isConnected || !sources.size || view.dialog.open) return;
  const rect = view.more.getBoundingClientRect();
  view.dialog.style.setProperty('--menu-right', `${Math.max(12, innerWidth - rect.right)}px`);
  view.dialog.style.setProperty('--menu-top', `${Math.max(12, rect.bottom + 8)}px`);
  view.dialog.showModal();
  set(view.more, 'aria-expanded', 'true');
}

function buildHost(layout) {
  const host = own('div'); host.setAttribute(HOST, layout);
  const root = host.attachShadow({ mode: 'open' });
  const style = own('style'); style.textContent = rewriteAssetUrls(dockCss);
  const bar = own('nav', 'dock'); bar.setAttribute('aria-label', 'Main navigation');
  const primary = own('div', 'primary');
  const more = own('button', 'destination more'); more.type = 'button';
  more.append(icon('more'), own('span', 'destination-label', 'More'));
  more.setAttribute('aria-haspopup', 'dialog'); more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', `iwf-nav-menu-${layout}`);
  more.setAttribute('aria-label', 'More');
  const trailing = own('div', 'trailing');
  bar.append(primary, more, trailing);
  const dialog = own('dialog', 'menu'); dialog.id = `iwf-nav-menu-${layout}`; dialog.setAttribute('aria-labelledby', 'menu-heading');
  const head = own('div', 'menu-head');
  const title = own('h2', '', 'More'); title.id = 'menu-heading';
  const close = own('button', 'close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close navigation');
  head.append(title, close);
  const secondary = own('nav', 'secondary'); secondary.setAttribute('aria-label', 'More destinations');
  const utilities = own('div', 'utilities');
  let tools = null;
  if (layout === 'desktop') {
    tools = own('div'); tools.setAttribute('data-iw-fantasy-nav-tools', '1');
    const toolsRoot = tools.attachShadow({ mode: 'open' });
    utilities.classList.add('header-utilities');
    utilities.setAttribute('role', 'group'); utilities.setAttribute('aria-label', 'Game utilities');
    toolsRoot.append(style.cloneNode(true), utilities);
    dialog.append(head, secondary);
  } else dialog.append(head, secondary, utilities);
  root.append(style, bar, dialog);
  const view = { host, root, more, primary, trailing, dialog, secondary, utilities, tools };
  more.addEventListener('click', () => guard('navigation:open', () => openMenu(view)));
  close.addEventListener('click', () => releaseFocus(view));
  dialog.addEventListener('close', () => set(more, 'aria-expanded', 'false'));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) releaseFocus(view);
  });
  return view;
}

function syncMarks(desired) {
  for (const el of marked) if (!desired.has(el)) unmark([SOURCE], el);
  for (const [el, value] of desired) mark(el, SOURCE, value);
  marked = new Set(desired.keys());
}

export function navigationPass() {
  if (!isRuntimeActive()) return;
  const source = resolveNav();
  const model = source && readModel(source);
  if (!model) {
    // React normally replaces rather than clones DOM. A native clone may
    // nevertheless carry our old hide marker; adopt it so fallback releases it.
    if (source?.getAttribute(SOURCE) === 'nav') { mark(source, SOURCE, 'nav'); marked.add(source); }
    clearNavigation(); return;
  }
  if (source !== nav) for (const view of hosts) releaseFocus(view);
  nav = source;
  sources = new Map(model.entries.map(e => [e.key, e]));
  if (!hosts.length) hosts = [buildHost('desktop'), buildHost('mobile')];
  const [desktop, mobile] = hosts;
  if (desktop.host.nextElementSibling !== nav) nav.before(desktop.host);
  if (mobile.host.parentElement !== document.body) document.body.append(mobile.host);
  const context = nav.closest('[data-iw-chrome="shell"]') || nav.parentElement;
  const header = context.querySelector(':scope > header');
  if (desktop.tools.parentElement !== (header || nav.parentElement)) {
    if (header) header.append(desktop.tools);
    else nav.before(desktop.tools);
  }
  // Secondary pages omit the zone bar, so the native port deliberately does
  // not classify a merged shell there. Give the owned rail its own frame.
  const currentShell = context.matches('[data-iw-chrome="shell"]') && context.querySelector('[data-iw-chrome="zone-text"]') ? context : null;
  if (shell !== currentShell) { if (shell) unmark([SHELL], shell); shell = currentShell; }
  if (shell) mark(shell, SHELL, '1');
  set(desktop.host, 'data-iw-fantasy-nav-framed', shell ? null : '1');
  for (const view of hosts) {
    const keys = view === desktop ? DESKTOP_PRIMARY : PRIMARY;
    const primary = keys.map(key => sources.get(key)).filter(Boolean);
    const trailing = view === desktop ? model.entries.filter(e => e.key === 'toolkit') : [];
    const secondary = model.entries.filter(e => !keys.includes(e.key) && NAMES[e.key]);
    const utilities = model.entries.filter(e => !keys.includes(e.key) && !NAMES[e.key] && !trailing.includes(e) && !(view === desktop && e.key === 'settings'));
    if ((view === mobile) !== matchMedia('(max-width: 767px)').matches) releaseFocus(view);
    syncGroup(view.primary, primary, model.active);
    syncGroup(view.trailing, trailing, model.active);
    if (view.trailing.hidden !== !trailing.length) view.trailing.hidden = !trailing.length;
    syncGroup(view.secondary, secondary, model.active);
    syncGroup(view.utilities, utilities, model.active);
    set(view.more, 'aria-current', secondary.some(e => e.key === model.active) ? 'page' : null);
    const moreHidden = view === desktop || (!secondary.length && !utilities.length);
    if (view.more.hidden !== moreHidden) view.more.hidden = moreHidden;
    if (view.utilities.hidden !== !utilities.length) view.utilities.hidden = !utilities.length;
    if (view.tools && view.tools.hidden !== !utilities.length) view.tools.hidden = !utilities.length;
  }
  const desired = new Map([[nav, 'nav']]);
  if (model.presence) desired.set(model.presence, 'utility');
  if (model.theme) desired.set(model.theme.closest('[data-iw-theme-toggle]'), 'utility');
  syncMarks(desired);
}

export function navigationText(parents) {
  if (nav && parents.some(p => nav.contains(p) || p.closest?.('[data-iw-zone-link],[data-iw-theme-toggle]'))) navigationPass();
}

export function clearNavigation() {
  for (const view of hosts) { releaseFocus(view); view.host.remove(); view.tools?.remove(); }
  hosts = [];
  syncMarks(new Map());
  if (shell) unmark([SHELL], shell);
  shell = null; nav = null; sources.clear();
}
