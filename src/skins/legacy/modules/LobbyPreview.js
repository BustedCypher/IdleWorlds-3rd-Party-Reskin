/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * LobbyPreview.js — TESTING FEATURE. Not part of the skin's design.
 *
 * A "🧪 Test:" strip under the Raid Dungeon heading in the raid LOBBY (never
 * in a fight), with four separate toggles (Curtis, 2026-10-08):
 *
 *   Pending invite  a "Waiting for an answer (2)" block in the invite card,
 *                   or, when you lead nothing, a whole test invite card;
 *   Full party      test rows that top the member list up to 8;
 *   Ready check     a test ready-check card (member view: a Confirm button
 *                   that only marks the card confirmed). It never opens the
 *                   pop-up: that is the fourth toggle's job;
 *   Pop-up          the ready-check pop-up alone, with a 30s demo countdown
 *                   (GuildLobby.setLobbyTestPopup).
 *
 * Every test node is built from the game's OWN markup (chunk 8577, and the
 * 2026-10-08 live capture), so GuildPanels, GuildLobby and the CSS treat it
 * exactly like the real thing: it is appended (rule 2), carries no React
 * handler, and every button in it does nothing except the test card's own
 * Confirm. Test nodes are `data-iw-lobby-dummy`; the strip and its toggles are
 * `data-iw-lobby-test`. `clearLobbyPreview` removes both; the toggles' state is
 * module state and resets with the page.
 *
 * Remove this module, its import and call sites in GuildLobby.js (each marked
 * "TESTING FEATURE") and the `data-iw-lobby-test` rules in guild.css once the
 * lobby is settled.
 */

import { setLobbyTestPopup, lobbyTestPopupOn } from './GuildLobby.js';

const DUMMY = 'data-iw-lobby-dummy';
const TEST = 'data-iw-lobby-test';
const FULL_PARTY = 8;

const state = { invite: false, party: false, ready: false };

const ROSTER = [
  { name: 'Test Tank', guild: 'Omen', skill: 'Combat', lend: ['🎯', 'Challenge'], ready: true },
  { name: 'Test Healer', guild: 'Royal Flush', skill: 'Spellcrafting', lend: ['✨', 'Mend'], ready: true },
  { name: 'Test Warder', guild: 'Omen', skill: 'Jewelcrafting', lend: ['💠', 'Ward'], ready: false },
  { name: 'Test Smith', guild: null, skill: 'Smithing', lend: ['🛡️', 'Fortify'], ready: true },
  { name: 'Test Weaver', guild: 'Omen', skill: 'Tailoring', lend: ['🧵', 'Veil'], ready: false },
  { name: 'Test Miner', guild: 'Royal Flush', skill: 'Mining', lend: ['⛏️', 'War Cry'], ready: true },
  { name: 'Test Alchemist', guild: 'Omen', skill: 'Alchemy', lend: ['🧪', 'Cleanse'], ready: true },
  { name: 'Test Forester', guild: null, skill: 'Woodcutting', lend: ['🩸', 'Rend'], ready: false },
];

function html(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const node = t.content.firstElementChild;
  node.setAttribute(DUMMY, '1');
  return node;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const readyBadge = ready => (ready
  ? '<span class="rounded border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">READY</span>'
  : '<span class="text-[11px] text-white/25">Not ready</span>');

/** A pickup / raid-guest row (the live capture's shape). */
const guestRow = p => html(`<div class="flex items-center justify-between gap-2 rounded-lg bg-sky-400/5 p-2"><div class="min-w-0"><button type="button" class="truncate text-left text-xs font-medium text-white hover:underline">${esc(p.name)}</button><p class="truncate text-[10px] text-white/40">${p.guild ? `from ${esc(p.guild)}` : 'no guild'} · ${esc(p.skill)} Lv70</p></div><span class="flex shrink-0 items-center gap-1">${readyBadge(p.ready)}</span></div>`);

/** A guild member row (the game source's shape). */
const memberRow = p => html(`<div class="rounded-lg bg-white/5 p-2.5 space-y-2"><div class="flex items-center justify-between gap-2"><div class="flex min-w-0 items-center gap-1.5"><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span><button type="button" class="truncate text-sm font-medium hover:underline underline-offset-2 text-white">${esc(p.name)}</button><span class="shrink-0 text-[10px] text-amber-200/70" title="Guild Points earned in this guild (1 per day played)">⭐ 2</span></div><div class="flex shrink-0 items-center gap-1.5"><span class="rounded border px-1.5 py-0.5 text-[10px] font-medium border-white/15 text-white/40" title="Combat skill level">Combat 70</span></div></div><div class="flex flex-wrap items-center justify-between gap-2"><div class="min-w-[140px] flex-1"><div class="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-sky-200"><span>${p.lend[0]}</span><span class="truncate text-xs font-semibold">${esc(p.lend[1])}</span><span class="shrink-0 text-[10px] text-sky-300/60">${esc(p.skill)} · Lv70</span></div></div><span class="flex shrink-0 items-center gap-1">${readyBadge(p.ready)}</span></div></div>`);

const waitingBlock = () => html(`<div class="rounded-lg bg-white/5 p-2 space-y-1"><p class="text-[10px] font-semibold text-white/70">Waiting for an answer (2)</p><div class="flex items-center justify-between gap-2 text-[10px]"><span class="truncate text-white/80">Test Invitee</span><span class="flex shrink-0 items-center gap-2"><span class="text-amber-200/80">invited 3m ago</span><button type="button" class="text-white/40 underline hover:text-white/70">cancel</button></span></div><div class="flex items-center justify-between gap-2 text-[10px]"><span class="truncate text-white/80">Another Invitee</span><span class="flex shrink-0 items-center gap-2"><span class="text-amber-200/80">invited 12m ago</span><button type="button" class="text-white/40 underline hover:text-white/70">cancel</button></span></div></div>`);

const inviteCard = () => html(`<div class="compact-panel p-3 space-y-2"><div class="flex items-center justify-between"><p class="text-[11px] font-semibold text-white">⚔️ Invite to your pickup group</p><span class="text-[10px] text-white/40">4/8</span></div><p class="text-[10px] text-white/40">Invite anyone in your league, guildless or from any guild.</p><div class="flex gap-2"><div class="relative flex-1"><input class="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-white/30" placeholder="Display name (test)" autocomplete="off" value=""></div><button class="button-primary px-3 py-1.5 text-xs" disabled="">Invite</button></div></div>`);

function readyCheckCard() {
  const card = html(`<div class="compact-panel p-3 space-y-2 border border-amber-300/50 bg-amber-950/30"><div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-amber-100">⚔️ Ready check: Ashmaw Normal (test)</p><span class="text-xs tabular-nums text-amber-200">28s</span></div><p class="text-[11px] text-white/70">✅ Test Tank, Test Healer<span class="block text-white/50">⏳ Waiting on: you, Test Warder</span></p><div class="flex flex-wrap gap-2"><button class="button-primary px-4 py-1.5 text-xs">Confirm — I'm here!</button></div></div>`);
  // The only live control in a test node: confirming marks the test card done,
  // the way the game swaps the button for its confirmed line.
  card.querySelector('button').addEventListener('click', event => {
    event.preventDefault();
    event.currentTarget.parentElement.replaceChildren(html('<span class="text-[11px] text-emerald-300">You\'re confirmed. The fight starts when everyone is.</span>'));
  });
  return card;
}

/* -------------------------------------------------------------- sync -- */

function syncInvite(root) {
  const dummies = [...root.querySelectorAll(`[${DUMMY}][data-iw-lobby-kind="invite"]`)];
  if (!state.invite) { dummies.forEach(n => n.remove()); return; }
  if (dummies.some(n => n.isConnected)) return;
  const real = root.querySelector('[data-iw-guild-card="form"]:not([data-iw-lobby-dummy])');
  if (real && /^invite\b/i.test(real.textContent.replace(/^[^\p{L}]+/u, ''))) {
    const block = waitingBlock();
    block.dataset.iwLobbyKind = 'invite';
    real.append(block);
    return;
  }
  // No invite card of your own: a whole test card in the stacked block.
  const stack = root.querySelector('[data-iw-guild-card="prep"], [data-iw-guild-card="lend"]')?.parentElement;
  if (!stack || stack === root) return;
  const card = inviteCard();
  card.dataset.iwLobbyKind = 'invite';
  card.append(waitingBlock());
  stack.append(card);
}

function syncParty(root) {
  const members = root.querySelector('[data-iw-guild-card="members"]');
  const dummies = [...root.querySelectorAll(`[${DUMMY}][data-iw-lobby-kind="party"]`)];
  if (!members) { dummies.forEach(n => n.remove()); return; }
  // The list is wherever a real roster row lives; that row's own role says
  // whether the group is guests (pickup / raid guests) or guild members.
  const real0 = members.querySelector(`[data-iw-guild-role="guest"]:not([${DUMMY}]), [data-iw-guild-role="member"]:not([${DUMMY}])`);
  const list = real0?.parentElement || members.querySelector('[data-iw-guild-role="guests"]');
  if (!list) return;
  const guests = !real0 || real0.getAttribute('data-iw-guild-role') === 'guest';
  const real = [...list.children].filter(c => c.tagName === 'DIV' && !c.hasAttribute(DUMMY));
  const want = state.party ? Math.max(0, Math.min(ROSTER.length, FULL_PARTY - real.length)) : 0;
  if (dummies.length === want && dummies.every(d => d.parentElement === list)) return;
  dummies.forEach(n => n.remove());
  for (const spec of ROSTER.slice(0, want)) {
    const row = guests ? guestRow(spec) : memberRow(spec);
    row.dataset.iwLobbyKind = 'party';
    list.append(row);
  }
}

function syncReady(root, head) {
  const dummy = root.querySelector(`[${DUMMY}][data-iw-lobby-kind="ready"]`);
  if (!state.ready) { dummy?.remove(); return; }
  if (dummy?.isConnected) return;
  const card = readyCheckCard();
  card.dataset.iwLobbyKind = 'ready';
  // Where the game puts its own: right under the head (and the strip).
  const bar = root.querySelector(`:scope > [${TEST}="bar"]`);
  (bar || head).after(card);
}

/* ------------------------------------------------------------ toggles -- */

const TOGGLES = [
  { key: 'invite', text: 'Pending invite', title: 'Testing feature: show a pending invite' },
  { key: 'party', text: 'Full party', title: 'Testing feature: top the member list up to 8' },
  { key: 'ready', text: 'Ready check', title: 'Testing feature: show a ready-check card (no pop-up)' },
  { key: 'popup', text: 'Pop-up', title: 'Testing feature: show the ready-check pop-up' },
];

const pressedOf = key => (key === 'popup' ? lobbyTestPopupOn() : state[key]);

function syncBar(root, head, redecorate) {
  let bar = root.querySelector(`:scope > [${TEST}="bar"]`);
  if (!bar) {
    bar = document.createElement('div');
    bar.setAttribute(TEST, 'bar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Lobby test toggles');
    const lead = document.createElement('span');
    lead.setAttribute(TEST, 'label');
    lead.textContent = '🧪 Test:';
    bar.append(lead);
    for (const spec of TOGGLES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute(TEST, spec.key);
      button.setAttribute('data-iw-guild-role', 'test-toggle');
      button.title = spec.title;
      button.textContent = spec.text;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (spec.key === 'popup') setLobbyTestPopup(!lobbyTestPopupOn(), () => redecorate());
        else state[spec.key] = !state[spec.key];
        redecorate();
      });
      bar.append(button);
    }
  }
  if (bar.previousElementSibling !== head) head.after(bar);
  for (const button of bar.querySelectorAll('button')) {
    const pressed = String(!!pressedOf(button.getAttribute(TEST)));
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
  }
}

/**
 * Every Guild pass (GuildLobby), lobby only: the strip, then each test.
 * `redecorate` reruns the pass on a click: a toggle is module state, which no
 * mutation reports (CLAUDE.md, mutation cost).
 */
export function syncLobbyPreview(root, redecorate) {
  const head = root.querySelector(':scope > [data-iw-guild-role="head"]');
  const lobby = !!head && !!root.querySelector('[data-iw-guild-card="boss"]') && !root.querySelector('.raid-battle-backdrop');
  if (!lobby) { clearLobbyPreview(root); return; }
  syncBar(root, head, redecorate);
  syncInvite(root);
  syncParty(root);
  syncReady(root, head);
}

export function clearLobbyPreview(root) {
  if (!root) return;
  root.querySelectorAll(`[${DUMMY}], [${TEST}="bar"]`).forEach(node => node.remove());
}
