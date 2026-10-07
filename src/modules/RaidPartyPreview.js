/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * RaidPartyPreview.js — TESTING FEATURE. Not part of the skin's design.
 *
 * A "🧪 Test: full party" toggle in the Guild panel's head row, present ONLY
 * while a raid fight is on screen (a `.raid-battle-backdrop` exists). When on,
 * it tops the live party up to FULL_PARTY with dummy raider frames, so the
 * Raid HUD's party row, effect strips, "N raiders · …" caption and phone
 * wrapping can be judged at full size from a small real raid. Remove this
 * module (its import and the call sites in GuildPanels.js, each marked
 * "TESTING FEATURE", the one in RaidHud.js, plus the `data-iw-raid-test` rule
 * in guild.css) once the full-party layout is settled.
 *
 * A second toggle, "🧪 Effects", injects 2, 4 or 6 test buffs and as many
 * test debuffs into the HUD (see "effect preview" below).
 *
 * HOW A DUMMY IS MADE. Each one is a deep clone of a REAL raider frame, so it
 * carries the live game's exact markup and sprite, with the skin's marks
 * stripped and its name, skill, HP, charge and status spans rewritten. It is
 * then appended to `.raid-arena-floor` (appended, never moved: rule 2) and
 * GuildPanels/RaidHud tag and draw it exactly as they draw a real raider. A
 * clone carries none of React's per-node fiber expando, so React's delegated
 * handlers never see it, and the clone keeps the game's `disabled` — it does
 * nothing when pressed (rule 1).
 *
 * MARKS. Dummies are `data-iw-raid-dummy`, NOT `data-iw-raid-owned`: RaidHud
 * skips titled spans inside an owned node, so an owned dummy would lose its
 * status effects. The toggles are `data-iw-raid-test="party|effects"`. Both are removed by
 * `clearRaidPartyPreview`, and the toggle and every dummy are removed when the
 * fight ends. Both choices are module state: they reset with the page.
 */

const DUMMY = 'data-iw-raid-dummy';
const TEST = 'data-iw-raid-test';

/** The lobby's "7/8 ready" — the most raiders a fight has been seen to hold. */
const FULL_PARTY = 8;

/**
 * Shown in this order, as many as the real party leaves room for. The first
 * four alone show every frame state the HUD draws — full, amber, critical
 * (rose), down, a shield, a tank and a debuff — so even a small top-up does.
 */
const ROSTER = [
  { name: 'Test Tank', skill: 'Combat (Tank)', hp: 100, charge: 80, status: [['🎯', 'Tanking'], ['🛡️', '220 shield']] },
  { name: 'Test Smith', skill: 'Smithing', hp: 41, charge: 20, status: [['🩸', 'Cursed — reduced healing']] },
  { name: 'Test Weaver', skill: 'Tailoring', hp: 18, charge: 90 },
  { name: 'Test Mason', skill: 'Construction', hp: 0, charge: 0 },
  { name: 'Test Alchemist', skill: 'Alchemy', hp: 88, charge: 35, status: [['🛡️', '140 shield']] },
  { name: 'Test Miner', skill: 'Mining', hp: 64, charge: 60 },
  { name: 'Test Forester', skill: 'Woodcutting', hp: 76, charge: 45 },
  { name: 'Test Spellwright', skill: 'Spellcrafting', hp: 95, charge: 70, status: [['🛡️', '96 shield']] },
];

const HP_FILL = /(?:^|\s)bg-(?:emerald|green|amber|yellow|orange|rose|red)-\d+(?:\/\d+)?(?=\s|$)/g;

let enabled = false;

const isTrack = el => el?.children.length === 1 && /%$/.test(String(el.firstElementChild.style?.width || ''));

/** A clean copy of one real raider: the game's markup, none of the skin's. */
function cleanClone(raider) {
  const copy = raider.cloneNode(true);
  copy.querySelectorAll('[data-iw-raid-owned]').forEach(node => node.remove());
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) if (attr.name.startsWith('data-iw-') || attr.name === 'id') node.removeAttribute(attr.name);
  }
  return copy;
}

function buildDummy(template, spec) {
  const dummy = cleanClone(template);
  dummy.setAttribute(DUMMY, '1');
  dummy.setAttribute('aria-label', `${spec.name} (test dummy)`);
  // The game greys a downed raider; a clone of a standing one would not be.
  dummy.classList.toggle('opacity-35', spec.hp === 0);

  const [nameEl, skillEl] = dummy.querySelectorAll(':scope > p');
  if (nameEl) {
    nameEl.textContent = spec.name;
    // Your own nameplate is sky; a dummy is never you.
    nameEl.className = nameEl.className.replace(/(?:^|\s)text-sky-\d+(?:\/\d+)?/g, ' ').trim() + ' text-white';
  }
  if (skillEl) skillEl.textContent = spec.skill;

  const [hpTrack, chargeTrack] = [...dummy.querySelectorAll(':scope > div')].filter(isTrack);
  const hpFill = hpTrack?.firstElementChild;
  if (hpFill) {
    hpFill.style.width = `${spec.hp}%`;
    const toneClass = spec.hp <= 25 ? 'bg-rose-500' : spec.hp <= 50 ? 'bg-amber-400' : 'bg-emerald-400';
    hpFill.className = `${hpFill.className.replace(HP_FILL, ' ').trim()} ${toneClass}`;
  }
  const chargeFill = chargeTrack?.firstElementChild;
  if (chargeFill) chargeFill.style.width = `${spec.charge}%`;

  // Status spans live in the sprite box (the first child), titled.
  dummy.querySelectorAll('[title]').forEach(span => span.remove());
  const spriteBox = dummy.firstElementChild;
  for (const [glyph, title] of spec.status || []) {
    const span = document.createElement('span');
    span.className = 'absolute -top-1 left-0 text-[10px]';
    span.title = title;
    span.textContent = glyph;
    spriteBox?.append(span);
  }
  return dummy;
}

/**
 * Bring one arena's floor to the wanted number of dummies. Called from
 * GuildPanels.decorateArena BEFORE the raider sweep, so the dummies are tagged
 * and drawn in the same pass. A settled floor writes nothing.
 */
export function syncPartyPreview(arena) {
  const floor = arena.querySelector(':scope > .raid-arena-floor');
  if (!floor) return;
  const dummies = [...floor.querySelectorAll(`:scope > [${DUMMY}]`)];
  const real = [...floor.querySelectorAll(':scope > button, :scope > div')].filter(r => !r.hasAttribute(DUMMY));
  const want = enabled && real.length ? Math.max(0, Math.min(ROSTER.length, FULL_PARTY - real.length)) : 0;
  if (dummies.length === want) return;
  dummies.forEach(dummy => dummy.remove());
  if (!want) return;
  // A standing raider as the template: a downed one carries the game's grey and skull.
  const template = real.find(r => !/(?:^|\s)opacity-35(?:\s|$)/.test(r.className)) || real[0];
  floor.append(...ROSTER.slice(0, want).map(spec => buildDummy(template, spec)));
}
/* --------------------------------------------- effect preview -- */

/**
 * The second toggle, "🧪 Effects": cycles off → 2 → 4 → 6, injecting that many
 * test buffs AND that many test debuffs as RAID-WIDE effects. They never touch
 * the game's DOM: RaidHud merges `previewEffects()` into the effects it read
 * from the Raid skills panel, so every standing raider's strip carries them and
 * the timer row draws one bar each — the densest case the HUD can meet.
 *
 * Names are deliberately not the game's own ("War Cry", "Ward"), so a real
 * effect and a test one never share a timer key. Tones come from RaidHud's
 * toneOf(): curse/bleed art, or burn/poison/"reduced" in the title, read as a
 * debuff — every test debuff's title says so. Seconds count down from the
 * clock, so on the live page (where the cast countdown ticks every second and
 * re-runs the HUD) the bars drain and loop; a static fixture shows them full.
 */
const EFFECT_STEPS = [0, 2, 4, 6];
const TEST_BUFFS = [
  { art: 'war-cry', name: 'Battle Hymn', glyph: '⚔️', dur: 12, title: 'Battle Hymn (test) — raid ATK up' },
  { art: 'ward', name: 'Aegis', glyph: '💠', dur: 18, title: 'Aegis (test) — fire resist up' },
  { art: 'shield', name: 'Barrier', glyph: '🛡️', dur: 9, title: 'Barrier (test) — absorbs damage' },
  { art: null, name: 'Haste', glyph: '⚡', dur: 7, title: 'Haste (test) — action speed up' },
  { art: null, name: 'Regrowth', glyph: '💚', dur: 15, title: 'Regrowth (test) — heal over time' },
  { art: null, name: 'Mistveil', glyph: '💨', dur: 5, title: 'Mistveil (test) — dodge up' },
];
const TEST_DEBUFFS = [
  { art: 'curse', name: 'Hex', glyph: '🩸', dur: 14, title: 'Hex (test) — reduced healing' },
  { art: 'bleed', name: 'Rend', glyph: '🩸', dur: 8, title: 'Rend (test) — bleeding' },
  { art: null, name: 'Scorch', glyph: '🔥', dur: 6, title: 'Scorch (test) — burn damage' },
  { art: null, name: 'Venom', glyph: '☠️', dur: 11, title: 'Venom (test) — poison damage' },
  { art: null, name: 'Slowed', glyph: '🐌', dur: 4, title: 'Slowed (test) — reduced action speed' },
  { art: null, name: 'Weakened', glyph: '🪶', dur: 10, title: 'Weakened (test) — reduced damage' },
];

let effectCount = 0;

/** The test effects in RaidHud's shape ({ art, name, glyph, value, title }). */
export function previewEffects() {
  if (!effectCount) return [];
  const now = Math.floor(Date.now() / 1000);
  return [...TEST_BUFFS.slice(0, effectCount), ...TEST_DEBUFFS.slice(0, effectCount)]
    .map(({ dur, ...e }) => ({ ...e, value: `${dur - (now % dur)}s` }));
}

/* ---------------------------------------------------- the toggles -- */

const TOGGLES = {
  party: {
    title: 'Testing feature: fill the raid party with dummy frames',
    advance: () => { enabled = !enabled; },
    text: () => (enabled ? '🧪 Test: hide dummies' : '🧪 Test: full party'),
    pressed: () => enabled,
  },
  effects: {
    title: 'Testing feature: add test buffs and debuffs (cycles 2 / 4 / 6 of each, then off)',
    advance: () => { effectCount = EFFECT_STEPS[(EFFECT_STEPS.indexOf(effectCount) + 1) % EFFECT_STEPS.length]; },
    text: () => (effectCount ? `🧪 Effects: ${effectCount} + ${effectCount}` : '🧪 Effects: off'),
    pressed: () => effectCount > 0,
  },
};

/**
 * Both toggles, appended to the panel's head row while a fight is on screen
 * and removed when it ends. `redecorate` re-runs the arena pass on click: the
 * effect preview is carried by module state alone, which no mutation reports
 * (CLAUDE.md, mutation cost), so the pass must be run here.
 */
export function syncPartyPreviewToggle(root, head, redecorate) {
  const arenas = () => [...root.querySelectorAll('.raid-battle-backdrop')];
  const live = !!head && arenas().length > 0;
  for (const [key, spec] of Object.entries(TOGGLES)) {
    let toggle = head?.querySelector(`:scope > [${TEST}="${key}"]`);
    if (!live) { toggle?.remove(); continue; }
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.setAttribute(TEST, key);
      toggle.title = spec.title;
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        spec.advance();
        updateToggle(toggle, spec);
        for (const arena of arenas()) redecorate(arena);
      });
      head.append(toggle);
    }
    updateToggle(toggle, spec);
  }
}

function updateToggle(toggle, spec) {
  const text = spec.text();
  if (toggle.textContent !== text) toggle.textContent = text;
  const pressed = String(spec.pressed());
  if (toggle.getAttribute('aria-pressed') !== pressed) toggle.setAttribute('aria-pressed', pressed);
}

export function clearRaidPartyPreview(root) {
  if (!root) return;
  root.querySelectorAll(`[${DUMMY}], [${TEST}]`).forEach(node => node.remove());
}
