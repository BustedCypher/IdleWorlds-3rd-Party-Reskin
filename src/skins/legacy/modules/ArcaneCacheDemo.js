/** Skin-owned cache demo. No game state, network actions, or second observer.
 * A shadow root keeps cinematic DOM/CSS out of the game's classifier sweeps. */
import { assetUrl, isRuntimeActive, warnOnce } from './Runtime.js';
import { createCacheLootView } from './ArcaneCacheLootView.js';
import css from '../styles/arcane-cache.css';

export const CACHE_OPENING_MS = 3000;
const ART = 'assets/arcane-cache/chest-states.png';
const TRIGGER = '[data-iw-cache-trigger]';
const CACHE_DROP_MS = 440;
let active = null;
let toolbarButton = null;
let bulkButton = null;

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const button = (className, label, action) => {
  const el = make('button', className, label);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
};

function later(run, delay, action) {
  const timer = setTimeout(() => {
    run.timers.delete(timer);
    if (active === run && isRuntimeActive()) action();
  }, delay);
  run.timers.add(timer);
}

function clearTimers(run) {
  for (const timer of run.timers) clearTimeout(timer);
  run.timers.clear();
}

function close(run = active) {
  if (!run || active !== run) return;
  active = null;
  clearTimers(run);
  run.motion.removeEventListener('change', run.onMotion);
  run.loot.dispose();
  run.dialog.close();
  run.dialog.remove();
  const focusTarget = run.returnFocus?.isConnected ? run.returnFocus : (run.count > 1 ? bulkButton : toolbarButton);
  if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
}

function phase(run, name) {
  run.phase = name;
  run.scene.dataset.phase = name;
}

function waiting(run) {
  phase(run, 'waiting');
  run.open.disabled = false;
  run.status.textContent = run.count > 1 ? `${run.count} caches. One extraordinary haul.` : 'Something extraordinary is waiting inside.';
  run.countSelect.disabled = false;
  run.open.focus({ preventScroll: true });
}

function reveal(run) {
  phase(run, 'revealed');
  run.heading.textContent = 'Treasures revealed';
  run.status.textContent = run.count > 1 ? `${run.count} caches opened · Rare treasures above, the rest below.` : 'A little magic. A worthy haul.';
  run.actions.hidden = false;
  run.announce.textContent = `${run.count} ${run.count === 1 ? 'cache' : 'caches'} opened. ` + run.loot.reveal();
  run.replay.focus({ preventScroll: true });
}

function openChest(run) {
  if (active !== run || run.phase !== 'waiting') return;
  run.open.disabled = true;
  run.countSelect.disabled = true;
  run.open.blur();
  phase(run, 'opening');
  run.status.textContent = 'The seal is breaking…';
  run.announce.textContent = 'Opening Arcane Cache.';
  later(run, run.motion.matches ? 240 : CACHE_OPENING_MS, () => reveal(run));
}

function drop(run) {
  clearTimers(run);
  run.heading.textContent = 'Arcane Cache';
  run.status.textContent = 'A sealed cache of untold possibilities.';
  run.announce.textContent = '';
  run.actions.hidden = true;
  prepareLoot(run);
  run.open.disabled = true;
  phase(run, 'dropping');
  later(run, run.motion.matches ? 120 : CACHE_DROP_MS, () => waiting(run));
}

function prepareLoot(run) {
  run.loot.prepare(run.count);
  run.openLabel.textContent = run.count > 1 ? `Break ${run.count} seals` : 'Break the seal';
  run.replay.textContent = run.count > 1 ? `Open another ${run.count}` : 'Open another';
}

export function showArcaneCacheDemo(trigger = toolbarButton, count = 1) {
  if (!isRuntimeActive() || active) return;
  const dialog = make('dialog', 'iw-cache-dialog');
  dialog.dataset.iwArcaneCache = '1';
  dialog.setAttribute('aria-label', 'Arcane Cache opening demo');
  const shell = make('div');
  const shadow = shell.attachShadow({ mode: 'open' });
  const style = make('style', '', css);
  const scene = make('section', 'scene');
  const run = {
    dialog, shadow, scene, timers: new Set(), phase: 'loading', count,
    motion: matchMedia('(prefers-reduced-motion: reduce)'),
    returnFocus: trigger || document.activeElement,
  };
  active = run;
  scene.dataset.bulk = String(count > 1);
  scene.style.setProperty('--drop-duration', `${CACHE_DROP_MS}ms`);
  scene.style.setProperty('--open-duration', `${CACHE_OPENING_MS}ms`);
  scene.style.setProperty('--cache-corners', `url("${assetUrl('assets/inventory/panel_corners.webp')}")`);
  scene.style.setProperty('--cache-ground', `url("${assetUrl('assets/skills_panel_texture.webp')}")`);
  run.announce = make('p', 'sr-only');
  run.announce.setAttribute('role', 'status');
  run.announce.setAttribute('aria-live', 'polite');
  run.loot = createCacheLootView(run.announce);
  scene.dataset.reduced = String(run.motion.matches);
  phase(run, 'loading');
  const exit = button('exit', '×', () => close(run));
  exit.setAttribute('aria-label', 'Close Arcane Cache');
  const mast = make('header', 'mast');
  const overline = make('p', 'overline', 'A LITTLE WONDER, SEALED AWAY');
  run.heading = make('h1', '', 'Arcane Cache');
  run.status = make('p', 'status', 'Summoning your cache…');
  mast.append(overline, run.heading, run.status);
  const batch = make('label', 'batch-choice', 'OPEN TOGETHER');
  batch.hidden = count === 1;
  run.countSelect = make('select', 'batch-size');
  run.countSelect.setAttribute('aria-label', 'Number of caches');
  for (const size of [20,50,100]) {
    const option = make('option', '', `${size} caches`);
    option.value = String(size); run.countSelect.append(option);
  }
  run.countSelect.value = String(count);
  run.countSelect.addEventListener('change', () => {
    if (run.phase !== 'waiting') return;
    run.count = Number(run.countSelect.value);
    prepareLoot(run);
    run.status.textContent = `${run.count} caches. One extraordinary haul.`;
  });
  batch.append(run.countSelect);
  mast.append(batch);
  const stage = make('div', 'stage');
  const halo = make('div', 'halo');
  halo.setAttribute('aria-hidden', 'true');
  const seal = make('div', 'seal');
  seal.setAttribute('aria-hidden', 'true');
  seal.append(make('span', '', '✧'), make('span', '', '✦'), make('span', '', '✧'));
  const chest = make('div', 'chest');
  chest.setAttribute('aria-hidden', 'true');
  for (const state of ['closed', 'open']) {
    const sprite = make('span', `chest-sprite chest-${state}`);
    sprite.style.backgroundImage = `url("${assetUrl(ART)}")`;
    chest.append(sprite);
  }
  const shockwave = make('div', 'shockwave');
  const echo = make('div', 'shockwave shockwave-echo');
  const runes = make('div', 'burst-runes');
  runes.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) {
    const rune = make('span', '', ['✧','◇','✦'][i % 3]);
    rune.style.setProperty('--angle', `${i * 30}deg`); runes.append(rune);
  }
  const rays = make('div', 'burst-rays');
  for (let i = 0; i < 12; i++) {
    const ray = make('i'); ray.style.setProperty('--angle', `${i * 30}deg`); rays.append(ray);
  }
  const flash = make('div', 'flash');
  const motes = make('div', 'motes');
  motes.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 64; i++) {
    const mote = make('i');
    const angle = i * Math.PI * 2 / 64;
    mote.style.setProperty('--dx', `${Math.cos(angle) * (220 + i % 5 * 44)}px`);
    mote.style.setProperty('--dy', `${Math.sin(angle) * (170 + i % 5 * 31) - 90}px`);
    mote.style.setProperty('--turn', `${i * 41}deg`);
    mote.style.setProperty('--delay', `${970 + i % 6 * 30}ms`);
    motes.append(mote);
  }
  run.open = button('open-cache', '', () => openChest(run));
  run.open.setAttribute('aria-label', 'Open Arcane Cache');
  run.open.disabled = true;
  const tapHint = make('span', 'tap-hint', 'CLICK THE CHEST TO OPEN');
  run.openLabel = make('span', '', 'Break the seal');
  run.open.append(make('span', 'chest-hit-area'), run.openLabel);
  stage.append(halo, seal, rays, runes, chest, shockwave, echo, flash, motes, run.loot.rewards, run.loot.empty, run.open, tapHint);
  run.actions = make('div', 'actions');
  run.actions.hidden = true;
  run.replay = button('replay', 'Open another', () => drop(run));
  run.actions.append(run.replay, button('done', 'Done', () => close(run)));
  const footer = make('footer', 'footer');
  footer.append(make('span', 'demo-label', 'PREVIEW'), make('span', '', 'Sample loot · No items are granted'));
  scene.append(exit, mast, stage, run.loot.summary, run.actions, footer, run.announce);
  shadow.append(style, scene);
  dialog.append(shell);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(run); });
  dialog.addEventListener('close', () => close(run));
  run.onMotion = () => {
    scene.dataset.reduced = String(run.motion.matches);
    if (!run.motion.matches) return;
    if (run.phase === 'opening') { clearTimers(run); reveal(run); }
    else if (run.phase === 'dropping') { clearTimers(run); waiting(run); }
  };
  run.motion.addEventListener('change', run.onMotion);
  document.body.append(dialog);
  try { dialog.showModal(); } catch (err) { close(run); warnOnce('cache:modal', err); return; }
  exit.focus({ preventScroll: true });
  const art = new Image();
  const failed = () => {
    if (active !== run || run.phase !== 'loading') return;
    clearTimers(run);
    phase(run, 'error');
    run.status.textContent = 'Chest artwork could not load. Close and try again.';
    run.announce.textContent = run.status.textContent;
  };
  art.onload = () => { if (active === run && run.phase === 'loading') drop(run); };
  art.onerror = failed;
  art.src = assetUrl(ART);
  later(run, 8000, failed);
}

/** Called with UIFoundation's resolved track, after Toolkit is appended. */
export function ensureArcaneCacheButton(track) {
  if (!track || !isRuntimeActive()) return;
  if (toolbarButton?.parentElement === track && bulkButton?.parentElement === track) return;
  toolbarButton?.remove(); bulkButton?.remove();
  const trigger = (label, key, count) => {
    const el = button('', label, event => showArcaneCacheDemo(event.currentTarget, count));
    el.dataset.iwNavLink = key;
    el.dataset.iwCacheTrigger = '1';
    el.dataset.iwUi = 'nav-tab';
    el.title = `Preview ${count === 1 ? 'one cache' : '20–100 caches'} (demo rewards)`;
    el.setAttribute('aria-haspopup', 'dialog');
    return el;
  };
  toolbarButton = trigger('Arcane Cache', 'arcane-cache', 1);
  bulkButton = trigger('Caches ×20', 'arcane-cache-bulk', 20);
  const toolkit = track.querySelector(':scope > [data-iw-nav-link="toolkit"]');
  if (toolkit) toolkit.after(toolbarButton, bulkButton);
  else track.append(toolbarButton, bulkButton);
}

export function clearArcaneCacheDemo() {
  close();
  document.querySelectorAll(TRIGGER).forEach(el => el.remove());
  toolbarButton = null;
  bulkButton = null;
}
