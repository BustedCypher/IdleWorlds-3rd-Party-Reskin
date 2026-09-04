/**
 * make-zone-surfaces.mjs
 *
 * PLACEHOLDER generator for the per-zone header background art:
 *
 *   assets/header/zones/zone_1.webp … zone_<N>.webp
 *
 * The real paintings are imported by `npm run import:zone-headers`. This script
 * only writes zones that have NO file yet (pass --force to overwrite), so it is
 * safe to run to fill a gap when a new zone ships before its art does.
 *
 * HeaderRenderer.applyZoneSurface() swaps `--iw-header-surface` to
 * `zones/zone_<N>.webp` for the zone the player is in, falling back to
 * `assets/header/header_surface.webp` past ZONE_SURFACE_MAX.
 *
 * Each image is a procedurally-painted stylised fantasy matte — layered sky,
 * a celestial body, atmospheric ridge silhouettes, a focal structure themed to
 * the zone (citadel / spire / gate / crater / rift / crystals / …), a
 * foreground band and per-zone weather particles, then a colour grade +
 * vignette. Pure canvas 2D render in headless Chromium — no source art, no
 * network. Seeded per zone, so re-runs are byte-stable.
 *
 * Usage:  node build-tools/make-zone-surfaces.mjs [count]
 *         npm run art:zones
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'header', 'zones');

const W = 1280;
const H = 320;
const QUALITY = 0.82;

// name, hue (deg), mood, structure, particle. Order == source_zone 1..34.
const ZONES = [
  ['Greenwake Den',        128, 'dawn',   'trees',    'motes'],
  ['Ironfang Trail',        28, 'overcast','peaks',   'dust'],
  ['Silverroot Hollow',    205, 'moon',   'trees',    'mist'],
  ['Goldfire Pass',         38, 'dusk',   'cliff',    'dust'],
  ['Mythril Bastion',      212, 'snow',   'citadel',  'snow'],
  ['Starsteel Frontier',   183, 'night',  'spires',   'stars'],
  ['Obsidian Depths',      276, 'void',   'crystals', 'glow'],
  ['Runic Barrens',         40, 'dusk',   'stones',   'dust'],
  ['Dragonfall Ridge',      12, 'molten', 'rift',     'embers'],
  ['Aether Spires',        188, 'ether',  'spires',   'motes'],
  ['Voidiron Abyss',       250, 'void',   'rift',     'fall'],
  ['Celestial Crown',       46, 'radiant','crown',    'shafts'],
  ['Bloodstone Scar',        2, 'molten', 'rift',     'ash'],
  ['Moonsteel Basin',      210, 'moon',   'cliff',    'mist'],
  ['Sunforge Expanse',      30, 'harsh',  'dunes',    'dust'],
  ['Nethergate Chasm',     104, 'void',   'arch',     'embers'],
  ['Stormglass Reach',     206, 'storm',  'cliff',    'rain'],
  ['Kingsfall Citadel',    282, 'dusk',   'citadel',  'motes'],
  ['Eternium Verge',       168, 'night',  'cliff',    'stars'],
  ['Astral Crucible',      308, 'void',   'ring',     'motes'],
  ['Gravite Maw',          230, 'overcast','crystals','dust'],
  ['Frostiron Shelf',      190, 'aurora', 'crystals', 'snow'],
  ['Dusksteel Strand',     268, 'dusk',   'trees',    'motes'],
  ['Titanium Wastes',       44, 'overcast','dunes',   'dust'],
  ['Skysteel Pinnacle',    204, 'day',    'spire',    'motes'],
  ['Emberium Caldera',      14, 'molten', 'crater',   'embers'],
  ['Soulsteel Necropolis', 150, 'ghost',  'tombs',    'wisps'],
  ['Chronite Spiral',       40, 'radiant','ring',     'motes'],
  ['Worldforge Core',       22, 'molten', 'anvil',    'sparks'],
  ['Voidglass Sanctum',    186, 'void',   'crystals', 'glow'],
  ['Thalassic Abyss',      182, 'deep',   'trees',    'bubbles'],
  ['Ashspire Ruins',        30, 'overcast','spire',   'ash'],
  ['Glacial Abyss',        196, 'snow',   'crystals', 'snow'],
  ['Primordial Spire',      96, 'dawn',   'spire',    'spores'],
];

// Default to the number of zones the game actually has; pass a higher count
// only to pre-render placeholders for zones not yet shipped.
const COUNT = Math.max(1, Math.min(120, Number(process.argv.find(a => /^\d+$/.test(a))) || ZONES.length));

const browser = await chromium.launch();
const page = await browser.newPage();

const files = await page.evaluate(async ({ zones, count, W, H, quality }) => {
  const rngFrom = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── mood → sky palette, ambience ──────────────────────────────────────
  const mood = (h, m) => {
    const S = (hh, s, l) => `hsl(${((hh % 360) + 360) % 360} ${s}% ${l}%)`;
    switch (m) {
      case 'dawn':    return { sky: [S(h + 8, 42, 46), S(h - 4, 40, 30), S(h - 8, 34, 14), S(h - 10, 30, 7)], glow: `hsla(${h + 20} 60% 60% / .32)`, haze: `hsla(${h} 30% 55% / .5)`, grade: 'hsla(35 60% 50% / .10)', stars: 0, sun: { c: `hsl(${h + 25} 80% 74%)`, e: `hsl(${h + 10} 65% 46%)`, r: .16, x: .30, y: .40 } };
      case 'day':     return { sky: [S(h, 48, 52), S(h + 6, 44, 40), S(h + 10, 36, 24), S(h + 12, 30, 12)], glow: `hsla(${h + 12} 50% 66% / .22)`, haze: `hsla(${h} 26% 68% / .45)`, grade: 'hsla(200 40% 55% / .06)', stars: 0, sun: { c: '#fff8e6', e: `hsl(${h + 30} 60% 66%)`, r: .12, x: .72, y: .28 } };
      case 'dusk':    return { sky: [S(h + 4, 40, 30), S(h + 18, 46, 20), S(h + 30, 40, 11), S(h + 34, 34, 6)], glow: `hsla(${h + 36} 70% 52% / .34)`, haze: `hsla(${h + 20} 34% 40% / .5)`, grade: 'hsla(20 55% 45% / .12)', stars: 40, sun: { c: `hsl(${h + 34} 78% 60%)`, e: `hsl(${h + 20} 60% 34%)`, r: .14, x: .24, y: .52 } };
      case 'night':   return { sky: [S(h, 40, 14), S(h + 6, 44, 9), S(h + 10, 40, 6), S(h + 12, 36, 3)], glow: `hsla(${h + 8} 55% 40% / .22)`, haze: `hsla(${h} 34% 28% / .42)`, grade: 'hsla(230 50% 30% / .12)', stars: 220, sun: { c: `hsl(${h + 6} 40% 78%)`, e: `hsl(${h} 30% 40%)`, r: .07, x: .74, y: .26, moon: 1 } };
      case 'moon':    return { sky: [S(h, 30, 22), S(h + 4, 34, 14), S(h + 8, 30, 8), S(h + 10, 26, 4)], glow: `hsla(${h} 40% 52% / .28)`, haze: `hsla(${h} 24% 44% / .55)`, grade: 'hsla(210 45% 40% / .10)', stars: 130, sun: { c: '#eaf1ff', e: `hsl(${h} 34% 52%)`, r: .12, x: .70, y: .30, moon: 1 } };
      case 'void':    return { sky: [S(h, 46, 12), S(h + 10, 52, 7), S(h - 6, 44, 4), '#020104'], glow: `hsla(${h} 70% 42% / .3)`, haze: `hsla(${h} 40% 24% / .4)`, grade: `hsla(${h} 60% 20% / .16)`, stars: 90, sun: { c: `hsl(${h} 80% 60%)`, e: `hsl(${h - 20} 70% 20%)`, r: .1, x: .5, y: .34, dark: 1 } };
      case 'molten':  return { sky: [S(h + 4, 55, 26), S(h + 14, 62, 16), S(h + 20, 50, 8), '#0a0402'], glow: `hsla(${h + 20} 90% 50% / .4)`, haze: `hsla(${h + 12} 60% 34% / .5)`, grade: 'hsla(14 80% 45% / .16)', stars: 0, sun: { c: `hsl(${h + 22} 95% 64%)`, e: `hsl(${h + 6} 80% 34%)`, r: .15, x: .5, y: .5 } };
      case 'harsh':   return { sky: [S(h - 6, 42, 56), S(h, 50, 40), S(h + 8, 44, 22), S(h + 10, 34, 10)], glow: `hsla(${h + 6} 80% 66% / .4)`, haze: `hsla(${h} 40% 62% / .55)`, grade: 'hsla(38 70% 50% / .12)', stars: 0, sun: { c: '#fffdf2', e: `hsl(${h + 20} 85% 60%)`, r: .18, x: .52, y: .32 } };
      case 'storm':   return { sky: [S(h, 22, 24), S(h + 4, 20, 16), S(h + 6, 18, 10), S(h + 8, 16, 5)], glow: `hsla(${h + 20} 40% 50% / .2)`, haze: `hsla(${h} 16% 40% / .5)`, grade: 'hsla(210 30% 35% / .12)', stars: 0, sun: { c: `hsl(${h} 20% 66%)`, e: `hsl(${h} 16% 34%)`, r: .09, x: .3, y: .3, dim: 1 } };
      case 'overcast':return { sky: [S(h, 16, 40), S(h + 2, 14, 30), S(h + 4, 12, 18), S(h + 6, 10, 9)], glow: `hsla(${h} 20% 60% / .18)`, haze: `hsla(${h} 12% 55% / .55)`, grade: 'hsla(40 20% 45% / .06)', stars: 0, sun: { c: `hsl(${h} 18% 74%)`, e: `hsl(${h} 12% 46%)`, r: .11, x: .64, y: .3, dim: 1 } };
      case 'snow':    return { sky: [S(h, 24, 46), S(h + 4, 26, 34), S(h + 6, 22, 20), S(h + 8, 18, 10)], glow: `hsla(${h} 40% 68% / .24)`, haze: `hsla(${h} 24% 66% / .6)`, grade: 'hsla(200 40% 55% / .08)', stars: 0, sun: { c: '#f4f9ff', e: `hsl(${h} 30% 64%)`, r: .12, x: .28, y: .28 } };
      case 'aurora':  return { sky: [S(h, 34, 16), S(h + 6, 38, 10), S(h + 10, 34, 6), '#02040a'], glow: `hsla(${h} 50% 44% / .22)`, haze: `hsla(${h} 26% 34% / .4)`, grade: 'hsla(160 45% 40% / .1)', stars: 170, sun: { c: '#eef7ff', e: `hsl(${h} 30% 50%)`, r: .08, x: .76, y: .24, moon: 1 }, aurora: 1 };
      case 'ghost':   return { sky: [S(h, 18, 18), S(h + 4, 20, 12), S(h + 6, 16, 7), '#040604'], glow: `hsla(${h} 40% 44% / .24)`, haze: `hsla(${h} 22% 34% / .5)`, grade: 'hsla(150 40% 40% / .12)', stars: 60, sun: { c: `hsl(${h} 45% 74%)`, e: `hsl(${h} 30% 34%)`, r: .1, x: .3, y: .36, dim: 1 } };
      case 'ether':   return { sky: [S(h, 40, 34), S(h + 8, 44, 22), S(h + 12, 38, 12), S(h + 14, 30, 6)], glow: `hsla(${h} 60% 56% / .3)`, haze: `hsla(${h} 34% 50% / .55)`, grade: 'hsla(185 50% 50% / .1)', stars: 80, sun: { c: `hsl(${h} 70% 80%)`, e: `hsl(${h} 55% 46%)`, r: .13, x: .68, y: .3 } };
      case 'radiant': return { sky: [S(h, 46, 44), S(h + 6, 50, 30), S(h + 10, 44, 16), S(h + 12, 34, 8)], glow: `hsla(${h + 6} 80% 66% / .42)`, haze: `hsla(${h} 40% 56% / .5)`, grade: 'hsla(46 70% 55% / .12)', stars: 0, sun: { c: '#fffdf0', e: `hsl(${h + 14} 80% 62%)`, r: .2, x: .5, y: .3 } };
      case 'deep':    return { sky: [S(h, 44, 14), S(h + 4, 48, 9), S(h + 6, 44, 6), '#010305'], glow: `hsla(${h} 60% 40% / .26)`, haze: `hsla(${h} 34% 24% / .5)`, grade: 'hsla(185 55% 30% / .16)', stars: 0, sun: { c: `hsl(${h} 55% 66%)`, e: `hsl(${h} 45% 26%)`, r: .1, x: .42, y: .18, dim: 1 } };
      default:        return mood(h, 'dusk');
    }
  };

  // ── ridge silhouette ─────────────────────────────────────────────────
  const ridge = (ctx, rng, seed, baseY, amp, rough, color, freq) => {
    const r = rngFrom(seed);
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, baseY - r() * amp);
    const seg = 26;
    for (let i = 0; i <= seg; i += 1) {
      const x = (W * i) / seg;
      const y = baseY
        - Math.abs(Math.sin(i * freq + seed) + 0.6 * Math.sin(i * freq * 2.3 + seed)) * amp
        - (r() - 0.5) * rough;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  // ── focal structure silhouettes ─────────────────────────────────────
  const SIL = '#04060a';
  const structure = (ctx, rng, type, m, gx) => {
    const cx = W * (gx ?? (0.34 + rng() * 0.32));
    const groundY = H * 0.82;
    const rim = m.sun.c;
    ctx.save();
    ctx.fillStyle = SIL;
    ctx.strokeStyle = `hsla(0 0% 100% / .0)`;

    const tower = (x, w, h, crenel, ruined, roof) => {
      const top = groundY - h;
      ctx.fillRect(x - w / 2, top, w, h);
      if (roof && !ruined) {
        ctx.beginPath(); ctx.moveTo(x - w * 0.62, top); ctx.lineTo(x, top - w * 0.9); ctx.lineTo(x + w * 0.62, top); ctx.closePath(); ctx.fill();
        ctx.fillRect(x - 1, top - w * 1.5, 2, w * 0.62);
        ctx.beginPath(); ctx.moveTo(x + 1, top - w * 1.5); ctx.lineTo(x + w * 0.5, top - w * 1.34); ctx.lineTo(x + 1, top - w * 1.14); ctx.closePath(); ctx.fill();
      }
      if (crenel && !roof && !ruined) for (let i = -1; i <= 1; i += 1) ctx.fillRect(x + i * (w / 3) - w / 10, top - w / 5, w / 5, w / 5);
      if (ruined) { ctx.fillStyle = '#0a0d12'; ctx.beginPath(); ctx.moveTo(x - w / 2, top + h * 0.18); ctx.lineTo(x + w / 2, top); ctx.lineTo(x + w / 2, top + h * 0.30); ctx.lineTo(x - w / 2, top + h * 0.12); ctx.closePath(); ctx.fill(); ctx.fillStyle = SIL; }
      // faint rim light on left edge
      ctx.fillStyle = `hsla(0 0% 100% / .05)`; ctx.fillRect(x - w / 2, top, 1.5, h); ctx.fillStyle = SIL;
    };
    const spike = (x, w, h, curve) => {
      const top = groundY - h;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, groundY);
      ctx.quadraticCurveTo(x - w / 2 + curve, groundY - h * 0.5, x, top);
      ctx.quadraticCurveTo(x + w / 2 - curve, groundY - h * 0.5, x + w / 2, groundY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = `hsla(0 0% 100% / .06)`;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + 2, top + 6); ctx.lineTo(x + w * 0.14, groundY); ctx.lineTo(x + w * 0.10, groundY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = SIL;
    };
    const pine = (x, w, h) => {
      const b = groundY;
      ctx.fillRect(x - w * 0.05, b - h * 0.28, w * 0.1, h * 0.28);
      for (let k = 0; k < 3; k += 1) {
        const yy = b - h * 0.22 - k * h * 0.24;
        const ww = w * (1 - k * 0.26);
        ctx.beginPath(); ctx.moveTo(x, yy - h * 0.32); ctx.lineTo(x - ww / 2, yy); ctx.lineTo(x + ww / 2, yy); ctx.closePath(); ctx.fill();
      }
    };

    if (type === 'citadel') {
      const ruined = m.grade.includes('282') || rng() > 0.6;
      ctx.fillRect(cx - W * 0.19, groundY - H * 0.16, W * 0.38, H * 0.16);
      for (let i = -5; i <= 5; i += 1) ctx.fillRect(cx + i * W * 0.033 - W * 0.008, groundY - H * 0.19, W * 0.016, H * 0.03);
      tower(cx - W * 0.16, W * 0.05, H * 0.30, 1, ruined, 0);
      tower(cx - W * 0.06, W * 0.045, H * 0.42, 1, ruined, 1);
      tower(cx + W * 0.02, W * 0.062, H * 0.58, 1, false, 1);
      tower(cx + W * 0.12, W * 0.042, H * 0.36, 1, ruined, 1);
      tower(cx + W * 0.19, W * 0.04, H * 0.24, 1, ruined, 0);
    } else if (type === 'spire') {
      spike(cx, W * 0.12, H * 0.74, W * 0.02);
      spike(cx - W * 0.09, W * 0.05, H * 0.34, W * 0.01);
      spike(cx + W * 0.08, W * 0.06, H * 0.42, W * 0.01);
    } else if (type === 'spires' || type === 'peaks') {
      for (let i = 0; i < 7; i += 1) {
        const x = W * (0.12 + i * 0.12) + (rng() - 0.5) * 30;
        spike(x, W * (0.03 + rng() * 0.04), H * (0.28 + rng() * 0.42), W * 0.008);
      }
    } else if (type === 'arch') {
      const w = W * 0.30, h = H * 0.62, top = groundY - h, legW = w * 0.16;
      ctx.fillRect(cx - w / 2, top + h * 0.32, legW, h * 0.68);
      ctx.fillRect(cx + w / 2 - legW, top + h * 0.32, legW, h * 0.68);
      ctx.beginPath(); ctx.moveTo(cx - w / 2, top + h * 0.34);
      ctx.quadraticCurveTo(cx, top - h * 0.14, cx + w / 2, top + h * 0.34);
      ctx.lineTo(cx + w / 2 - legW, top + h * 0.40);
      ctx.quadraticCurveTo(cx, top + h * 0.06, cx - w / 2 + legW, top + h * 0.40);
      ctx.closePath(); ctx.fill();
      const gg = ctx.createRadialGradient(cx, groundY - h * 0.28, 0, cx, groundY - h * 0.28, w * 0.5);
      gg.addColorStop(0, m.glow.replace(/\/ [.\d]+\)/, '/ .5)')); gg.addColorStop(1, 'transparent');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = SIL;
    } else if (type === 'crown') {
      // Centred on the celestial body — a circlet haloing the sun reads as
      // "Celestial Crown"; offset to one side it just looked like debris.
      const x = W * m.sun.x, y = H * (m.sun.y + 0.10), w = W * 0.21, h = H * 0.19;
      const gg = ctx.createRadialGradient(x, y - h * 0.3, 0, x, y - h * 0.3, w * 1.1);
      gg.addColorStop(0, m.glow.replace(/\/ [.\d]+\)/, '/ .5)')); gg.addColorStop(1, 'transparent');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = SIL;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      for (let i = 0; i < 5; i += 1) {
        const p0 = x - w / 2 + (w * i) / 5;
        const p1 = x - w / 2 + (w * (i + 0.5)) / 5;
        const p2 = x - w / 2 + (w * (i + 1)) / 5;
        ctx.lineTo(p0, y);
        ctx.lineTo(p1, y - h * (i === 2 ? 1 : Math.abs(i - 2) === 1 ? 0.72 : 0.46));
        ctx.lineTo(p2, y);
      }
      ctx.lineTo(x + w / 2, y + h * 0.30);
      ctx.lineTo(x - w / 2, y + h * 0.30);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = m.sun.c; ctx.globalAlpha = 0.55;
      for (let i = 0; i < 5; i += 1) { ctx.beginPath(); ctx.arc(x - w / 2 + (w * (i + 0.5)) / 5, y + h * 0.15, 2.2, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (type === 'ring') {
      const y = H * 0.36;
      ctx.strokeStyle = m.sun.c; ctx.globalAlpha = 0.5;
      for (let k = 0; k < 3; k += 1) {
        ctx.lineWidth = 2 - k * 0.5; ctx.globalAlpha = 0.45 - k * 0.12;
        ctx.beginPath(); ctx.ellipse(cx, y + k * 8, W * (0.16 - k * 0.02), H * (0.10 - k * 0.012), -0.2, 0, Math.PI * (k < 2 ? 2 : 1.4)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (type === 'crater') {
      const y = groundY - H * 0.04;
      // Lava pooled in the bowl, painted BEFORE the rim so the dipped outline
      // frames it instead of covering it.
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const gg = ctx.createRadialGradient(cx, y + H * 0.06, 0, cx, y + H * 0.06, W * 0.17);
      gg.addColorStop(0, 'hsla(38 100% 66% / .8)'); gg.addColorStop(0.4, 'hsla(22 96% 48% / .42)'); gg.addColorStop(1, 'transparent');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
      const col = ctx.createLinearGradient(0, y - H * 0.34, 0, y + H * 0.1);
      col.addColorStop(0, 'transparent'); col.addColorStop(1, 'hsla(28 100% 56% / .28)');
      ctx.fillStyle = col; ctx.fillRect(cx - W * 0.14, y - H * 0.34, W * 0.28, H * 0.44);
      ctx.restore();
      ctx.fillStyle = SIL;
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, y + H * 0.02);
      ctx.lineTo(cx - W * 0.30, y - H * 0.04);
      ctx.quadraticCurveTo(cx - W * 0.16, y + H * 0.10, cx, y + H * 0.09);
      ctx.quadraticCurveTo(cx + W * 0.16, y + H * 0.10, cx + W * 0.30, y - H * 0.04);
      ctx.lineTo(W, y + H * 0.02); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'hsla(34 100% 70% / .30)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - W * 0.30, y - H * 0.04);
      ctx.quadraticCurveTo(cx - W * 0.16, y + H * 0.10, cx, y + H * 0.09);
      ctx.quadraticCurveTo(cx + W * 0.16, y + H * 0.10, cx + W * 0.30, y - H * 0.04);
      ctx.stroke();
    } else if (type === 'rift') {
      const y = groundY - H * 0.04;
      spike(cx - W * 0.26, W * 0.05, H * 0.36, 6); spike(cx + W * 0.28, W * 0.06, H * 0.44, 6);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      // Soft elongated plume — a hard-edged fillRect band left visible vertical
      // seams where the glow met the sky.
      ctx.save(); ctx.translate(cx, y + H * 0.06); ctx.scale(1, 2.4);
      const plume = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.10);
      plume.addColorStop(0, 'hsla(34 100% 64% / .42)'); plume.addColorStop(0.55, 'hsla(20 96% 48% / .16)'); plume.addColorStop(1, 'transparent');
      ctx.fillStyle = plume; ctx.fillRect(-W, -H, W * 2, H * 2); ctx.restore();
      const pool = ctx.createRadialGradient(cx, y + H * 0.06, 0, cx, y + H * 0.06, W * 0.15);
      pool.addColorStop(0, 'hsla(40 100% 70% / .55)'); pool.addColorStop(1, 'transparent');
      ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.fillStyle = SIL;
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, y + H * 0.02);
      ctx.lineTo(cx - W * 0.22, y + H * 0.04); ctx.lineTo(cx - W * 0.085, y + H * 0.07);
      ctx.lineTo(cx - W * 0.03, H); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W, y + H * 0.01);
      ctx.lineTo(cx + W * 0.22, y + H * 0.05); ctx.lineTo(cx + W * 0.08, y + H * 0.07);
      ctx.lineTo(cx + W * 0.025, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'hsla(36 100% 72% / .38)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - W * 0.085, y + H * 0.07); ctx.lineTo(cx - W * 0.03, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + W * 0.08, y + H * 0.07); ctx.lineTo(cx + W * 0.025, H); ctx.stroke();
    } else if (type === 'anvil') {
      const y = groundY, w = W * 0.14, h = H * 0.16;
      ctx.fillRect(cx - w * 0.18, y - h * 0.5, w * 0.36, h * 0.5);
      ctx.beginPath(); ctx.moveTo(cx - w / 2, y - h); ctx.lineTo(cx + w / 2, y - h);
      ctx.lineTo(cx + w * 0.7, y - h * 0.7); ctx.lineTo(cx + w * 0.2, y - h * 0.62);
      ctx.lineTo(cx + w * 0.2, y - h * 0.5); ctx.lineTo(cx - w * 0.2, y - h * 0.5);
      ctx.lineTo(cx - w * 0.2, y - h * 0.62); ctx.lineTo(cx - w * 0.7, y - h * 0.7); ctx.closePath(); ctx.fill();
      const gg = ctx.createRadialGradient(cx, y - h, 0, cx, y - h, W * 0.2);
      gg.addColorStop(0, m.glow.replace(/\/ [.\d]+\)/, '/ .7)')); gg.addColorStop(1, 'transparent');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = SIL;
    } else if (type === 'crystals' || type === 'stones') {
      const rectish = type === 'stones';
      for (let i = 0; i < 9; i += 1) {
        const x = W * (0.10 + i * 0.10) + (rng() - 0.5) * 26;
        const h = H * (0.16 + rng() * 0.5), w = W * (0.02 + rng() * 0.035), b = groundY + rng() * 8;
        ctx.fillStyle = SIL;
        if (rectish) { ctx.save(); ctx.translate(x, b); ctx.rotate((rng() - 0.5) * 0.14); ctx.fillRect(-w / 2, -h, w, h); ctx.restore(); }
        else { ctx.beginPath(); ctx.moveTo(x, b - h); ctx.lineTo(x - w / 2, b - h * 0.3); ctx.lineTo(x - w * 0.2, b); ctx.lineTo(x + w * 0.2, b); ctx.lineTo(x + w / 2, b - h * 0.3); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = m.sun.c; ctx.globalAlpha = 0.10 + rng() * 0.12;
        ctx.fillRect(x - w * 0.12, b - h, 1.4, h); ctx.globalAlpha = 1;
      }
    } else if (type === 'tombs') {
      for (let i = 0; i < 8; i += 1) {
        const x = W * (0.10 + i * 0.11) + (rng() - 0.5) * 20;
        const h = H * (0.08 + rng() * 0.12), w = W * 0.03;
        if (rng() > 0.6) { ctx.fillRect(x - w * 0.15, groundY - h * 1.4, w * 0.3, h * 1.4); ctx.fillRect(x - w * 0.5, groundY - h * 1.0, w, w * 0.25); }
        else { ctx.fillRect(x - w / 2, groundY - h, w, h); ctx.beginPath(); ctx.moveTo(x - w / 2, groundY - h); ctx.lineTo(x, groundY - h * 1.4); ctx.lineTo(x + w / 2, groundY - h); ctx.closePath(); ctx.fill(); }
      }
      tower(cx, W * 0.08, H * 0.34, 0, false);
    } else if (type === 'trees') {
      for (let i = 0; i < 6; i += 1) pine(W * (0.10 + i * 0.16) + (rng() - 0.5) * 30, W * (0.05 + rng() * 0.04), H * (0.3 + rng() * 0.35));
    } else if (type === 'dunes') {
      for (let k = 0; k < 4; k += 1) {
        const y = groundY - k * H * 0.06;
        ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, y);
        for (let x = 0; x <= W; x += 40) ctx.lineTo(x, y - Math.sin(x * 0.006 + k * 2 + rng()) * 16 - k * 3);
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fillStyle = `hsl(${m.sun.e.match(/\d+/)[0]} 24% ${7 + k * 2}%)`; ctx.fill();
      }
    } else if (type === 'cliff') {
      const side = rng() > 0.5 ? 1 : -1;
      ctx.fillStyle = SIL;
      ctx.beginPath();
      if (side > 0) { ctx.moveTo(W, H); ctx.lineTo(W, groundY - H * 0.28); ctx.lineTo(W * 0.52, groundY - H * 0.16); ctx.lineTo(W * 0.44, groundY - H * 0.02); ctx.lineTo(W * 0.5, H); }
      else { ctx.moveTo(0, H); ctx.lineTo(0, groundY - H * 0.28); ctx.lineTo(W * 0.48, groundY - H * 0.16); ctx.lineTo(W * 0.56, groundY - H * 0.02); ctx.lineTo(W * 0.5, H); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  // ── particles ────────────────────────────────────────────────────────
  const particles = (ctx, rng, kind, m) => {
    const N = { stars: 0, motes: 90, dust: 120, embers: 80, sparks: 120, snow: 140, ash: 130, mist: 0, rain: 160, glow: 60, wisps: 34, bubbles: 46, fall: 90, spores: 70, shafts: 0 }[kind] || 60;
    for (let i = 0; i < N; i += 1) {
      const x = rng() * W, y = rng() * H;
      let r = rng() * 1.6 + 0.4, a = 0.15 + rng() * 0.5, col = m.sun.c;
      if (kind === 'embers' || kind === 'sparks') { col = i % 3 ? '#ffb35a' : '#ff7a2a'; a = 0.35 + rng() * 0.5; r = rng() * 1.6 + 0.5; }
      if (kind === 'snow') { col = '#eaf2ff'; a = 0.3 + rng() * 0.5; r = rng() * 1.8 + 0.6; }
      if (kind === 'ash') { col = i % 2 ? '#6b6660' : '#3c3a37'; a = 0.25 + rng() * 0.45; }
      if (kind === 'dust') { col = m.haze.replace(/hsla?\(([^)]+)\/[^)]+\)/, 'hsl($1)'); a = 0.06 + rng() * 0.16; r = rng() * 2 + 0.6; }
      if (kind === 'wisps') { col = '#9fe6c4'; a = 0.15 + rng() * 0.35; r = rng() * 2.4 + 1; }
      if (kind === 'bubbles') { col = '#bfe9f2'; a = 0.12 + rng() * 0.3; }
      if (kind === 'spores') { col = '#d9e88a'; a = 0.2 + rng() * 0.4; }
      if (kind === 'glow') { col = m.sun.c; a = 0.1 + rng() * 0.3; r = rng() * 3 + 1; }
      if (kind === 'rain') {
        ctx.strokeStyle = `hsla(210 30% 78% / ${0.08 + rng() * 0.16})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16); ctx.stroke(); continue;
      }
      ctx.globalAlpha = a; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const out = [];
  for (let n = 1; n <= Math.max(count, zones.length); n += 1) {
    const base = zones[(n - 1) % zones.length];
    const hueShift = n > zones.length ? Math.floor((n - zones.length) / zones.length) * 53 : 0;
    const [name, hue, mo, struct, part] = base;
    const m = mood(hue + hueShift, mo);
    const seed = (n * 2654435761) >>> 0;
    const rng = rngFrom(seed);

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    m.sky.forEach((c, i) => sky.addColorStop(i / (m.sky.length - 1), c));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // aurora
    if (m.aurora) {
      for (let b = 0; b < 3; b += 1) {
        ctx.beginPath(); const y0 = H * (0.14 + b * 0.08);
        ctx.moveTo(0, y0);
        for (let x = 0; x <= W; x += 32) ctx.lineTo(x, y0 + Math.sin(x * 0.008 + b * 2 + seed) * 22);
        ctx.lineTo(W, y0 + 60); for (let x = W; x >= 0; x -= 32) ctx.lineTo(x, y0 + 60 + Math.sin(x * 0.008 + b) * 22);
        ctx.closePath();
        const ag = ctx.createLinearGradient(0, y0 - 30, 0, y0 + 70);
        ag.addColorStop(0, 'transparent'); ag.addColorStop(0.5, `hsla(${150 + b * 20} 70% 60% / .16)`); ag.addColorStop(1, 'transparent');
        ctx.fillStyle = ag; ctx.fill();
      }
    }

    // stars
    for (let i = 0; i < m.stars; i += 1) {
      const x = rng() * W, y = rng() * H * 0.6, r = rng() * 1.2 + 0.2;
      ctx.globalAlpha = 0.25 + rng() * 0.7; ctx.fillStyle = i % 11 ? '#eef2ff' : m.sun.c;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // celestial
    const cx = W * m.sun.x, cy = H * m.sun.y, cr = H * m.sun.r;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * (m.sun.dim ? 3 : 5.5));
    halo.addColorStop(0, m.glow); halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    if (!m.sun.dark) {
      const disc = ctx.createRadialGradient(cx - cr * 0.2, cy - cr * 0.2, 0, cx, cy, cr);
      disc.addColorStop(0, m.sun.c); disc.addColorStop(0.75, m.sun.c); disc.addColorStop(1, m.sun.e);
      ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill();
      if (m.sun.moon) { ctx.fillStyle = m.sky[1]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx + cr * 0.42, cy - cr * 0.32, cr * 0.9, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    } else {
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill();
      ctx.strokeStyle = m.sun.c; ctx.globalAlpha = 0.7; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 1.04, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }

    // light shafts
    if (part === 'shafts' || mo === 'deep') {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      // Kept very faint and narrow: at higher alpha these read as hard-edged
      // triangles pasted over the sky, not as light.
      for (let i = 0; i < 11; i += 1) {
        const sx = cx + (i - 5) * 26 + (rng() - 0.5) * 16;
        ctx.beginPath(); ctx.moveTo(sx, cy);
        ctx.lineTo(sx - 22 - i * 6, H); ctx.lineTo(sx + 22 + i * 6, H); ctx.closePath();
        ctx.fillStyle = m.glow.replace(/\/ [.\d]+\)/, `/ ${0.018 + rng() * 0.026})`);
        ctx.fill();
      }
      ctx.restore();
      // fade their feet into the horizon so no straight bottom edge shows
      const fade = ctx.createLinearGradient(0, H * 0.55, 0, H);
      fade.addColorStop(0, 'transparent'); fade.addColorStop(1, m.sky[2]);
      ctx.fillStyle = fade; ctx.globalAlpha = 0.55; ctx.fillRect(0, H * 0.55, W, H * 0.45); ctx.globalAlpha = 1;
    }

    // ridge layers (atmospheric: paler + bluer toward the back)
    const hz = m.haze;
    ridge(ctx, rng, seed + 1, H * 0.50, H * 0.10, 10, `hsla(${(hue + 10) % 360} 24% 20% / .55)`, 0.5);
    ridge(ctx, rng, seed + 2, H * 0.60, H * 0.14, 16, `hsl(${(hue + 6) % 360} 22% 12%)`, 0.42);
    // horizon haze
    const hb = ctx.createLinearGradient(0, H * 0.40, 0, H * 0.80);
    hb.addColorStop(0, 'transparent'); hb.addColorStop(0.7, hz); hb.addColorStop(1, 'transparent');
    ctx.fillStyle = hb; ctx.fillRect(0, 0, W, H);
    ridge(ctx, rng, seed + 3, H * 0.72, H * 0.12, 22, `hsl(${(hue + 4) % 360} 20% 7%)`, 0.34);

    // focal structure. Ground-shaped features (rift/crater/dunes/cliff) ARE
    // the foreground, so they paint last and skip the extra silhouette band —
    // otherwise the band buries the very thing that identifies the zone.
    const GROUND = ['rift', 'crater', 'dunes', 'cliff'].includes(struct);
    if (GROUND) {
      structure(ctx, rng, struct, m);
    } else {
      structure(ctx, rng, struct, m);
      ridge(ctx, rng, seed + 4, H * 0.92, H * 0.06, 14, '#020305', 0.6);
    }

    // particles
    particles(ctx, rng, part, m);

    // grade
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = m.grade; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // vignette
    const vig = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H * 0.5, W * 0.72);
    vig.addColorStop(0, 'transparent'); vig.addColorStop(1, 'hsla(0 0% 0% / .62)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    // edge darken L/R for the wide crop
    const eg = ctx.createLinearGradient(0, 0, W, 0);
    eg.addColorStop(0, 'hsla(0 0% 0% / .4)'); eg.addColorStop(0.12, 'transparent');
    eg.addColorStop(0.88, 'transparent'); eg.addColorStop(1, 'hsla(0 0% 0% / .4)');
    ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);

    // fine grain
    for (let i = 0; i < 2600; i += 1) {
      ctx.globalAlpha = rng() * 0.05;
      ctx.fillStyle = rng() > 0.5 ? '#fff' : '#000';
      ctx.fillRect(rng() * W, rng() * H, 1, 1);
    }
    ctx.globalAlpha = 1;

    // top hairline
    ctx.strokeStyle = `hsla(${hue} 40% 60% / .12)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(W, 1); ctx.stroke();

    out.push({ n, name, data: canvas.toDataURL('image/webp', quality).split(',')[1] });
  }
  return out.slice(0, Math.max(count, zones.length));
}, { zones: ZONES, count: COUNT, W, H, quality: QUALITY });

await browser.close();
await mkdir(OUT_DIR, { recursive: true });

// This is the PLACEHOLDER generator — it only fills zones with no real
// painting (imported by `npm run import:zone-headers`). Pass --force to
// overwrite everything, e.g. to preview the procedural set.
const force = process.argv.includes('--force');
const exists = async p => access(p).then(() => true, () => false);

let total = 0, wrote = 0, kept = 0;
for (const { n, data } of files) {
  const dest = path.join(OUT_DIR, `zone_${n}.webp`);
  if (!force && await exists(dest)) { kept += 1; continue; }
  const bytes = Buffer.from(data, 'base64');
  total += bytes.length;
  wrote += 1;
  await writeFile(dest, bytes);
}

console.log(
  `Wrote ${wrote} placeholder zone surface(s)` +
  (kept ? `, kept ${kept} existing (use --force to overwrite)` : '') +
  ` to ${path.relative(ROOT, OUT_DIR)}/` +
  (wrote ? ` (${W}x${H}, ${(total / 1024).toFixed(0)} KB, avg ${(total / wrote / 1024).toFixed(1)} KB)` : '')
);
