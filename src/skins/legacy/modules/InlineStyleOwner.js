/**
 * InlineStyleOwner
 *
 * Tracks only the inline CSS properties a skin module mutates. This lets a
 * renderer repair properties that React writes back while it is active AND
 * restore the game's most recent underlying value during teardown without
 * deleting unrelated inline styles.
 *
 * Why property-level ownership instead of snapshotting the whole `style`
 * attribute:
 *   • React may update another inline property while the skin is active.
 *   • Removing/replacing the whole style attribute would erase that update.
 *   • If React rewrites one of OUR owned properties, the next set() call sees
 *     the external value before re-applying the skin and promotes that value to
 *     the new native-underlay snapshot.
 *
 * CSSStyleDeclaration normalises values when they are written. For example,
 * `#DAD3C3` is commonly serialised back as `rgb(218, 211, 195)`. Ownership must
 * therefore remember the browser's POST-WRITE value, never the raw requested
 * string, or a later reconcile mistakes our own normalised value for a React
 * write and permanently promotes it to the "native" snapshot.
 */

export function createInlineStyleOwner() {
  const states = new WeakMap();
  const tracked = new Set();
  const refByElement = new WeakMap();
  const weakTracking = typeof WeakRef === 'function' && typeof FinalizationRegistry === 'function';
  const finalizer = weakTracking ? new FinalizationRegistry(ref => tracked.delete(ref)) : null;
  function track(el) {
    if (refByElement.has(el)) return;
    const ref = weakTracking ? new WeakRef(el) : el;
    refByElement.set(el, ref);
    tracked.add(ref);
    finalizer?.register(el, ref, ref);
  }
  function untrack(el) {
    const ref = refByElement.get(el);
    if (!ref) return;
    tracked.delete(ref);
    finalizer?.unregister(ref);
    refByElement.delete(el);
  }
  function trackedElements() {
    const live = [];
    for (const ref of [...tracked]) {
      const el = weakTracking ? ref.deref() : ref;
      if (el) live.push(el);
      else tracked.delete(ref);
    }
    return live;
  }

  function stateFor(el, prop) {
    let props = states.get(el);
    if (!props) {
      props = new Map();
      states.set(el, props);
      track(el);
    }

    let state = props.get(prop);
    const currentValue = el.style.getPropertyValue(prop);
    const currentPriority = el.style.getPropertyPriority(prop);

    if (!state) {
      state = {
        nativeValue: currentValue,
        nativePriority: currentPriority,
        appliedValue: null,
        appliedPriority: null,
      };
      props.set(prop, state);
    } else if (
      state.appliedValue !== null &&
      (currentValue !== state.appliedValue || currentPriority !== state.appliedPriority)
    ) {
      // Something outside this owner changed the property after our last write.
      // Treat that as the game's newest underlying state before re-applying.
      state.nativeValue = currentValue;
      state.nativePriority = currentPriority;
    }

    return state;
  }

  function set(el, prop, value, priority = 'important') {
    if (!el?.style) return false;
    const state = stateFor(el, prop);
    const beforeValue = el.style.getPropertyValue(prop);
    const beforePriority = el.style.getPropertyPriority(prop);

    // Always let CSSStyleDeclaration parse/normalise the requested value first.
    // Comparing `beforeValue` directly with the caller's raw value is unsafe:
    // equivalent colours, shorthands and numeric forms can serialise differently.
    el.style.setProperty(prop, value, priority);

    const afterValue = el.style.getPropertyValue(prop);
    const afterPriority = el.style.getPropertyPriority(prop);
    state.appliedValue = afterValue;
    state.appliedPriority = afterPriority;

    return beforeValue !== afterValue || beforePriority !== afterPriority;
  }

  function restoreElement(el) {
    const props = states.get(el);
    if (!props) return;

    for (const [prop, state] of props) {
      const currentValue = el.style.getPropertyValue(prop);
      const currentPriority = el.style.getPropertyPriority(prop);

      // If React changed the property after our last write and teardown arrived
      // before reconciliation, that current value is already the best native
      // state. Do not overwrite it with an older snapshot.
      const stillOurs = currentValue === state.appliedValue &&
        currentPriority === state.appliedPriority;
      if (!stillOurs) continue;

      if (state.nativeValue) {
        el.style.setProperty(prop, state.nativeValue, state.nativePriority || '');
      } else {
        el.style.removeProperty(prop);
      }
    }

    states.delete(el);
    untrack(el);
  }

  function restoreWithin(root) {
    if (!root) return;
    for (const el of trackedElements()) {
      if (el === root || root.contains?.(el)) restoreElement(el);
    }
  }

  function restoreAll() {
    for (const el of trackedElements()) restoreElement(el);
  }

  return { set, restoreElement, restoreWithin, restoreAll };
}
