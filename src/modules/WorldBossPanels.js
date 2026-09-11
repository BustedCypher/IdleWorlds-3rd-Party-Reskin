/** Presentation only: preserve native controls, text, state and handlers. */
import { AtlasService } from './AtlasService.js';
import { ItemDatabase } from './ItemDatabase.js';
import { SkillsArtService } from './SkillsArtService.js';
import { registerTooltipItem } from './TooltipEngine.js';
import { storageGet, storageSet } from './Runtime.js';
import fallbackItems from '../../assets/world-bosses/rewards.json';

const BOSSES = [
  { key: 'ancient_treant', name: 'Ancient Treant', ids: ['miners_gloves', 'herbalists_gloves', 'blacksmiths_gloves', 'alchemists_gloves', 'jewelcrafters_gloves', 'spellcrafters_gloves', 'tailors_gloves'] },
  { key: 'abyssal_behemoth', name: 'Abyssal Behemoth', ids: ['invisibility_ring'] },
  { key: 'world_eater', name: 'World Eater', ids: ['worldbreaker'] },
];
const fallback = new Map(fallbackItems.map(item => [item.item_id, item]));
fallback.set('tailors_gloves', { item_id: 'tailors_gloves', name: "Tailor's Gloves", category: 'Equipment', subcategory: 'Gloves slot', effects_raw: 'Tailoring skill bonus', acquisition_type: 'BossDrop', acquisition_summary: 'Rare Ancient Treant drop.' });
fallback.set('boss_upgrade_orb', { item_id: 'boss_upgrade_orb', name: 'Upgrade Orb', category: 'Consumable', effects_raw: 'The awarded orb tier follows your highest equipped gear tier, including your trinket.', acquisition_type: 'BossDrop', acquisition_summary: 'Possible reward from any world boss. Chance depends on contribution. The icon represents the orb family; your awarded tier may differ.' });
const signatures = new WeakMap();
const rewardPreferences = new Map();

function bindRewardDisclosure(section, boss) {
  const key = `iw-boss-rewards-collapsed:${boss.key}`;
  let preference = rewardPreferences.get(key);
  if (!preference) {
    preference = { collapsed: false, changed: false };
    preference.ready = storageGet(key).then(value => {
      if (!preference.changed) preference.collapsed = value === true;
    });
    rewardPreferences.set(key, preference);
  }
  section.open = !preference.collapsed;
  section.addEventListener('toggle', () => {
    if (!section.isConnected || preference.collapsed === !section.open) return;
    preference.collapsed = !section.open;
    preference.changed = true;
    void storageSet(key, preference.collapsed);
  });
  void preference.ready.then(() => {
    if (section.isConnected) section.open = !preference.collapsed;
  });
}
const strengthHistory = new WeakMap();
const impactAnimations = new WeakMap();
const impactCleanup = new WeakMap();
const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
function mark(el, key, value) { if (el && el.getAttribute(key) !== value) el.setAttribute(key, value); }
function owned(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.dataset.iwBossOwned = '1';
  if (text) el.textContent = text;
  return el;
}

function controlProgress(card) {
  for (const el of card.children) {
    if (el.hasAttribute('data-iw-boss-owned')) continue;
    const fill = el.children.length === 1 ? el.firstElementChild : null;
    const width = String(fill?.style?.width || '').trim();
    if (fill && /^\d+(?:\.\d+)?%$/.test(width)) return { track: el, percent: Math.max(0, Math.min(100, Number.parseFloat(width))) };
  }
  return { track: null, percent: null };
}

function strengthTeam(row) {
  const classes = [row, ...row.querySelectorAll('*')]
    .map(el => `${el.className || ''} ${el.getAttribute?.('style') || ''}`)
    .join(' ');
  const red = /(?:^|[\s:_-])(?:red|rose|pink|crimson)(?:[\s:_-]|$)/i.test(classes);
  const blue = /(?:^|[\s:_-])(?:blue|sky|cyan|azure)(?:[\s:_-]|$)/i.test(classes);
  if (red !== blue) return red ? 'red' : 'blue';
  return null;
}

function controlStrengths(card) {
  const candidates = [...card.querySelectorAll('p, span, strong')]
    .filter(el => !el.childElementCount && !el.closest('[data-iw-boss-owned]'))
    .map(el => {
      const raw = norm(el.textContent);
      if (!/^\d[\d,]*(?:\.\d+)?$/.test(raw)) return null;
      const value = Number(raw.replaceAll(',', ''));
      if (!Number.isFinite(value)) return null;
      let row = el.parentElement;
      let team = null;
      let strengthRow = el.parentElement;
      while (row && row !== card && !team) {
        team = strengthTeam(row);
        if (team) strengthRow = row;
        row = row.parentElement;
      }
      return { el, row: strengthRow, raw, value, team };
    })
    .filter(Boolean);
  let red = candidates.find(entry => entry.team === 'red');
  let blue = candidates.find(entry => entry.team === 'blue');
  // The live race rows are consistently red then blue. Keep that order as a
  // fallback for builds whose utility classes do not contain colour names.
  if ((!red || !blue) && candidates.length === 2) [red, blue] = candidates;
  return red && blue ? { red, blue } : null;
}

function ensureCrestLayers(crest) {
  if (crest.querySelector('.iw-control-crest-art')) return;
  for (const team of ['red', 'blue', 'contested']) {
    crest.appendChild(owned('span', `iw-control-crest-art iw-control-crest-art-${team}`));
  }
  for (const team of ['red', 'blue']) {
    const sword = owned('span', `iw-control-sword-energy iw-control-sword-energy-${team}`);
    sword.appendChild(owned('span', `iw-control-impact iw-control-impact-${team}`));
    crest.appendChild(sword);
  }
  crest.appendChild(owned('span', 'iw-control-crystal-core'));
}

function stopStrengthImpact(panel) {
  impactCleanup.get(panel)?.();
  impactCleanup.delete(panel);
  for (const animation of impactAnimations.get(panel) || []) animation?.cancel?.();
  impactAnimations.delete(panel);
}

function playStrengthImpact(panel, previous, strengths) {
  const preference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (preference?.matches) { stopStrengthImpact(panel); return; }
  if (!previous) return;
  const changed = [];
  if (previous.red !== strengths.red.value) changed.push('red');
  if (previous.blue !== strengths.blue.value) changed.push('blue');
  if (!changed.length) return;
  stopStrengthImpact(panel);
  const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;
  const animations = [];
  for (const team of changed) {
    const energy = panel.querySelector(`.iw-control-impact-${team}`);
    if (energy?.animate) animations.push(energy.animate([
      { opacity: 0, transform: 'translateX(-100%) scaleX(.45)' },
      { opacity: mobile ? .4 : .65, transform: 'translateX(65%) scaleX(1.1)', offset: .42 },
      { opacity: 0, transform: 'translateX(330%) scaleX(.6)' },
    ], { duration: mobile ? 1000 : 1250, delay: team === 'blue' ? 170 : 0, easing: 'cubic-bezier(.3,.1,.3,1)' }));
  }
  impactAnimations.set(panel, animations);
  // Listen only while a short impact exists, and detach on finish/cancel.
  // CSS handles preference changes for every ambient loop and crossfade.
  const onPreference = () => { if (preference.matches) stopStrengthImpact(panel); };
  preference?.addEventListener?.('change', onPreference);
  impactCleanup.set(panel, () => preference?.removeEventListener?.('change', onPreference));
  const finished = animations.map(animation => animation.finished).filter(Boolean);
  if (finished.length) Promise.allSettled(finished).then(() => {
    if (impactAnimations.get(panel) === animations) stopStrengthImpact(panel);
  });
}

function ensureDominion(card) {
  let panel = card.querySelector('.iw-control-dominion');
  if (panel) return panel;
  panel = owned('section', 'iw-control-dominion');
  panel.setAttribute('aria-label', 'Zone dominion status');
  const crest = owned('div', 'iw-control-crest');
  crest.setAttribute('aria-hidden', 'true');
  ensureCrestLayers(crest);
  const readout = owned('div', 'iw-control-readout');
  readout.append(
    owned('p', 'iw-control-kicker', 'Dominion Ward'),
    owned('p', 'iw-control-state'),
  );
  const meter = owned('div', 'iw-control-meter');
  const meterHead = owned('div', 'iw-control-meter-head');
  meterHead.append(owned('span', 'iw-control-meter-label', 'Ward Integrity'), owned('span', 'iw-control-meter-value'));
  const track = owned('div', 'iw-control-meter-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Ward integrity');
  const fill = owned('span', 'iw-control-meter-fill');
  const currents = owned('span', 'iw-control-meter-currents');
  currents.setAttribute('aria-hidden', 'true');
  currents.append(owned('span', 'iw-control-current-red'), owned('span', 'iw-control-current-blue'));
  fill.appendChild(currents);
  track.appendChild(fill);
  meter.append(meterHead, track);
  const factions = owned('div', 'iw-control-factions');
  factions.append(owned('span', 'iw-control-faction iw-control-faction-red', 'Crimson Oath'), owned('span', 'iw-control-versus', '✦'), owned('span', 'iw-control-faction iw-control-faction-blue', 'Azure Covenant'));
  panel.append(crest, readout, meter, factions);
  card.appendChild(panel);
  return panel;
}

function updateDominion(card, team) {
  const panel = ensureDominion(card);
  ensureCrestLayers(panel.querySelector('.iw-control-crest'));
  const hp = [...card.querySelectorAll('p')].find(el => !el.closest('[data-iw-boss-owned]') && /\b[\d,.]+(?:\s*\/\s*[\d,.]+)?\s*HP\b/i.test(norm(el.textContent)));
  const progress = controlProgress(card);
  const nativeStrengths = controlStrengths(card);
  const strengths = team === 'contested' ? nativeStrengths : null;
  const totalStrength = strengths ? strengths.red.value + strengths.blue.value : 0;
  const split = totalStrength > 0 ? strengths.red.value / totalStrength * 100 : 50;
  const percent = progress.percent;
  const value = strengths ? `${strengths.red.raw} · ${strengths.blue.raw}` : hp ? norm(hp.textContent) : team === 'contested' ? 'Under siege' : 'Fortified';
  const state = team === 'red' ? 'Crimson Dominion' : team === 'blue' ? 'Azure Dominion' : 'Ward contested';
  card.querySelectorAll('[data-iw-boss-role="control-strength"]').forEach(row => row.removeAttribute('data-iw-boss-role'));
  // React can update the ownership title before removing the native race rows.
  // Keep positively identified team rows hidden throughout that capture window;
  // the ambiguous numeric-order fallback remains limited to an active race.
  const hiddenStrengths = strengths || (nativeStrengths?.red.team === 'red' && nativeStrengths?.blue.team === 'blue' ? nativeStrengths : null);
  if (hiddenStrengths) {
    mark(hiddenStrengths.red.row, 'data-iw-boss-role', 'control-strength');
    mark(hiddenStrengths.blue.row, 'data-iw-boss-role', 'control-strength');
  }
  mark(hp, 'data-iw-boss-role', 'control-hp');
  mark(progress.track, 'data-iw-boss-role', 'control-progress');
  panel.querySelector('.iw-control-crest').dataset.iwControlCrest = team;
  panel.querySelector('.iw-control-state').textContent = state;
  panel.querySelector('.iw-control-meter-label').textContent = strengths ? 'Ward Strength' : 'Ward Integrity';
  panel.querySelector('.iw-control-meter-value').textContent = value;
  const meter = panel.querySelector('.iw-control-meter');
  const fill = panel.querySelector('.iw-control-meter-fill');
  if (strengths) {
    playStrengthImpact(panel, strengthHistory.get(card), strengths);
    strengthHistory.set(card, { red: strengths.red.value, blue: strengths.blue.value });
    meter.dataset.iwControlSource = 'factions';
    fill.style.width = '100%';
    fill.style.setProperty('--iw-control-split', `${Number(split.toFixed(1))}%`);
  } else {
    strengthHistory.delete(card);
    stopStrengthImpact(panel);
    delete meter.dataset.iwControlSource;
    fill.style.width = `${percent ?? 100}%`;
    // Keep the last battle split while currents fade out on capture.
  }
  const track = panel.querySelector('.iw-control-meter-track');
  track.setAttribute('aria-label', strengths ? 'Ward strength balance' : 'Ward integrity');
  if (strengths) {
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(Number(split.toFixed(1))));
    track.setAttribute('aria-valuetext', `Crimson ${strengths.red.raw}, Azure ${strengths.blue.raw}`);
  } else if (percent == null) {
    track.removeAttribute('aria-valuenow');
    track.removeAttribute('aria-valuemin');
    track.removeAttribute('aria-valuemax');
    track.setAttribute('aria-valuetext', value);
  } else {
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(percent));
    track.removeAttribute('aria-valuetext');
  }
}

function rewards(card, boss) {
  const signature = `${boss.key}:${ItemDatabase.revision()}:${AtlasService.isReady()}`;
  let section = card.querySelector('.iw-boss-rewards');
  if (section && signatures.get(card) === signature) return;
  const ids = [...new Set([...boss.ids, ...ItemDatabase.all().filter(item => item.acquisition_type === 'BossDrop' && `${item.acquisition_summary} ${item.acquisition_detail}`.includes(boss.name)).map(item => item.item_id), 'trader_token', 'boss_upgrade_orb'])];
  if (!section) {
    section = owned('details', 'iw-boss-rewards');
    section.setAttribute('aria-label', `${boss.name} possible rewards`);
    card.appendChild(section);
    bindRewardDisclosure(section, boss);
  }
  section.replaceChildren();
  section.appendChild(owned('summary', 'iw-boss-rewards-title', 'Possible Rewards'));
  const list = owned('div', 'iw-boss-reward-list');
  for (const id of ids) {
    const item = ItemDatabase.find({ id }) || fallback.get(id);
    if (!item) continue;
    const tile = owned('button', 'iw-boss-reward');
    tile.type = 'button';
    tile.dataset.iwTooltipTrigger = '1';
    tile.dataset.iwItem = id;
    tile.dataset.iwItemName = item.name;
    tile.setAttribute('aria-label', `${item.name} — item details`);
    registerTooltipItem(tile, item);
    const icon = owned('span', 'iw-boss-reward-icon');
    icon.setAttribute('aria-hidden', 'true');
    if (!AtlasService.paint(icon, id === 'boss_upgrade_orb' ? { name: 'Copper Upgrade Orb', id: 'copper_upgrade_orb' } : { id, name: item.name })) icon.textContent = '◆';
    tile.append(icon, owned('span', 'iw-boss-reward-name', item.name));
    list.appendChild(tile);
  }
  section.appendChild(list);
  signatures.set(card, signature);
}

export function decorateWorldBossPanel({ root, heading }) {
  if (!root.querySelector('.iw-boss-notice')) {
    const notice = owned('p', 'iw-boss-notice', 'There are no minimum requirements and no risk in joining and contributing to a world boss encounter.');
    const header = heading.parentElement;
    if (header !== root && !header.querySelector('.compact-panel')) header.after(notice);
    else heading.after(notice);
  }
  for (const card of root.querySelectorAll('.compact-panel')) {
    if (card.querySelector('.compact-panel')) continue;
    const header = [...card.children].find(el => !el.hasAttribute('data-iw-boss-owned'));
    const title = header?.querySelector('p') || (header?.matches('p') ? header : null);
    const label = norm(title?.textContent);
    const boss = BOSSES.find(entry => label.includes(entry.name));
    const control = /controls Zone\s+\d+|Zone\s+\d+.*(?:Race to capture|contested)/i.test(label);
    if (!boss && !control) continue;
    mark(card, 'data-iw-encounter', boss ? boss.key : 'zone');
    mark(header, 'data-iw-boss-role', 'header');
    mark(title, 'data-iw-boss-role', 'title');
    if (!card.querySelector('.iw-boss-art')) {
      const art = owned('div', 'iw-boss-art');
      art.setAttribute('aria-hidden', 'true');
      card.appendChild(art);
    }
    const action = [...header.querySelectorAll('button')].find(el => /prejoin|fight|defeated|join/i.test(norm(el.textContent)));
    mark(action, 'data-iw-boss-role', 'action');
    if (action) {
      const actionText = norm(action.textContent);
      mark(action, 'data-iw-boss-action-state', /prejoined|fighting/i.test(actionText) ? 'active' : 'idle');
      if (/prejoined/i.test(actionText)) mark(action, 'data-iw-boss-action-label', 'Queued');
      else if (/\bprejoin\b/i.test(actionText)) mark(action, 'data-iw-boss-action-label', 'Prejoin');
      else action.removeAttribute('data-iw-boss-action-label');
    }
    const participation = [...card.querySelectorAll('button, p')].find(el =>
      /world boss participation|players? currently fighting world boss|last battle participants/i.test(norm(el.textContent)));
    mark(participation, 'data-iw-boss-role', 'participation');
    let status = null;
    for (const p of card.querySelectorAll('p')) {
      if (p.closest('[data-iw-boss-owned]') || p === title) continue;
      const text = norm(p.textContent);
      if (/^(Solo|Raid|Mythic)$/i.test(text)) mark(p, 'data-iw-boss-role', 'difficulty');
      else if (/^Buff on kill:/.test(text)) mark(p, 'data-iw-boss-role', 'buff');
      else if (/^(Respawns|Buff active|No world buff|Protected for)|\d\s*HP$/.test(text)) {
        mark(p, 'data-iw-boss-role', 'timer');
        if (p.parentElement !== card && p.parentElement !== header) status = p.parentElement;
      }
    }
    mark(status, 'data-iw-boss-role', 'status');
    for (const el of card.children) {
      if (el.hasAttribute('data-iw-boss-owned') || el === header || el === status || el === participation) continue;
      const fill = el.children.length === 1 ? el.firstElementChild : null;
      if (fill && /%$/.test(String(fill.style?.width || '')) && /h-1|progress|rounded-full/i.test(`${el.className} ${fill.className}`)) {
        mark(el, 'data-iw-boss-role', 'progress');
      } else if (/Top Fighters|Last Kill Participants/i.test(norm(el.textContent))) {
        mark(el, 'data-iw-boss-role', 'details');
      }
    }
    // The skill renderer clears shared panel variables on unknown cards.
    // Own the action's variables instead so its artwork survives that cleanup.
    if (action && SkillsArtService.isReady() && !action.hasAttribute('data-iw-boss-art-ready')) {
      SkillsArtService.decoratePanel(action);
      action.dataset.iwBossArtReady = '1';
    }
    if (boss) rewards(card, boss);
    else {
      // Only the status title proves ownership, never fighter names/team buttons.
      const team = /red team controls/i.test(label) ? 'red' : /blue team controls/i.test(label) ? 'blue' : 'contested';
      mark(card, 'data-iw-control', team);
      updateDominion(card, team);
    }
  }
}

export function clearWorldBossPanel(root) {
  root.querySelectorAll('[data-iw-encounter="zone"]').forEach(card => strengthHistory.delete(card));
  root.querySelectorAll('.iw-control-dominion').forEach(stopStrengthImpact);
  root.querySelectorAll('[data-iw-boss-art-ready]').forEach(card => SkillsArtService.clearPanel(card));
  root.querySelectorAll('[data-iw-boss-owned]').forEach(el => el.remove());
  for (const attr of ['data-iw-encounter', 'data-iw-control', 'data-iw-boss-role', 'data-iw-boss-action-state', 'data-iw-boss-action-label', 'data-iw-boss-art-ready']) {
    root.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));
  }
}
