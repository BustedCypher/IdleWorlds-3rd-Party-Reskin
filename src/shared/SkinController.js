/** Exclusively activate one profile after the shared readiness barrier. */
export function createSkinController({ skins, waitUntilReady }) {
  let active = null;
  let requested = null;
  let revision = 0;
  let readiness = null;
  let pending = Promise.resolve();

  function update({ enabled, theme }) {
    const next = enabled !== false && Object.hasOwn(skins, theme) ? theme : null;
    if (next === requested) return pending;
    requested = next;
    const token = ++revision;
    if (active !== null) {
      skins[active].stop();
      active = null;
    }
    if (next === null) return (pending = Promise.resolve());

    readiness ??= Promise.resolve().then(waitUntilReady);
    pending = readiness.then(() => {
      if (token !== revision) return;
      active = next;
      try { skins[next].start(); }
      catch (err) {
        skins[next].stop();
        active = null;
        requested = null;
        throw err;
      }
    });
    return pending;
  }

  return { update, stop: () => update({ enabled: false, theme: null }) };
}
