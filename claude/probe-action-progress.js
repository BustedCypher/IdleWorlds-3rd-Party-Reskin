/* Current Action progress probe — paste in the console with the skin ACTIVE and
   an action running. READ-ONLY: it samples, it never writes to the page.

   What it answers, in order of how much the skin depends on it:

   1. HOW LONG IS A TICK? The smoothing is a CSS transition on the fill whose
      duration must equal the game's update interval — that is what turns the
      staircase into a true linear 0->100% ramp. UIFoundation measures this
      live and buckets it (100/250/500/1000/2000ms); this probe reports the raw
      interval so the bucket can be sanity-checked against reality.
   2. IS THERE A ONE-TICK HEAD START? If the first width written after a reset
      is one whole step above 0 rather than at 0, the game is rendering the
      progress at the END of the tick that just began. A linear transition of
      exactly one tick cancels that offset; a WRONG duration does not.
   3. WHAT IS THE ACTION'S TOTAL DURATION? Derived, not read: step size is
      tick/T, so T = tick / step. Housing tier and the rest are the game's
      business — this is only here to confirm the two numbers above are
      consistent with each other.
   4. WHO OWNS THE TRANSITION? Prints the computed `transition` on the fill so
      a game-side transition (or a stale skin build) is visible rather than
      guessed at.

   Let it run for at least two full actions so it sees a reset. It prints a
   summary and downloads iw-progress-probe.json. */
(() => {
  const SECONDS = 30;

  const track = document.querySelector('[data-iw-panel-part="progress"]') ||
    document.querySelector('#current-action-panel [role="progressbar"]');
  if (!track) { console.warn('[probe] no Current Action progress track found'); return; }

  const fillOf = () => [...track.querySelectorAll('[style]')]
    .find(el => /^\d+(?:\.\d+)?%$/.test(el.style.width || '')) || null;

  const pctOf = () => {
    const fill = fillOf();
    if (fill) return parseFloat(fill.style.width);
    const now = parseFloat(track.getAttribute('aria-valuenow'));
    const max = parseFloat(track.getAttribute('aria-valuemax'));
    return Number.isFinite(now) && Number.isFinite(max) && max > 0 ? (now / max) * 100 : null;
  };

  const t0 = performance.now();
  const samples = [];          // every width the game actually wrote
  let last = pctOf();
  let lastAt = t0;

  const tickHandle = setInterval(() => {
    const pct = pctOf();
    if (pct === null || Math.abs(pct - last) < 0.05) return;
    const at = performance.now();
    samples.push({ t: +(at - t0).toFixed(1), dt: +(at - lastAt).toFixed(1), pct, reset: pct < last });
    last = pct;
    lastAt = at;
  }, 8); // well under any plausible tick, so no write is missed

  setTimeout(() => {
    clearInterval(tickHandle);

    const forward = samples.filter(s => !s.reset && s.dt < 5000);
    const med = arr => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const tick = med(forward.map(s => s.dt));
    const step = med(forward.map((s, i) => (i ? s.pct - forward[i - 1].pct : null)).filter(v => v && v > 0));

    // The value written immediately AFTER a reset. If that is ~one step rather
    // than ~0, the game is a whole tick ahead of the wall clock at t=0.
    const firstAfterReset = samples
      .map((s, i) => (samples[i - 1]?.reset ? s.pct : null))
      .filter(v => v !== null);
    const resetFloors = samples.filter(s => s.reset).map(s => s.pct);

    const fill = fillOf();
    const report = {
      samples,
      writes: samples.length,
      resets: resetFloors.length,
      tickMs: tick,
      stepPct: step,
      inferredActionSeconds: tick && step ? +((tick / 1000) * (100 / step)).toFixed(2) : null,
      // The two numbers that decide whether the fix is correct:
      resetFloorPct: resetFloors,          // where the bar lands on completion
      firstValueAfterResetPct: firstAfterReset,
      oneTickHeadStart: step && resetFloors.length
        ? resetFloors.every(v => Math.abs(v - step) < step * 0.5)
        : null,
      fillTransition: fill ? getComputedStyle(fill).transition : null,
      skinTickBucket: track.dataset.iwProgressTick || '(not measured yet)',
      skinResetTagSeen: track.dataset.iwProgressReset || '(not during this sample)',
    };

    console.log('[probe] Current Action progress');
    console.table(samples.slice(0, 40));
    console.log(report);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'iw-progress-probe.json';
    a.click();
  }, SECONDS * 1000);

  console.log(`[probe] sampling for ${SECONDS}s — let at least two actions complete`);
})();
