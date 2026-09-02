import { JSDOM } from 'jsdom';

// Structure taken verbatim from the live capture's shellPath:
//   div.compact-row.py-2 -> div.space-y-1.5 -> div.panel.p-3.5 -> section.grid.gap-3.xl:hidden
// plus the sibling panels that section actually holds, and the hidden duplicate
// column the page carries alongside the visible one.
const html = `
<body>
  <section class="grid gap-3 xl:hidden" id="mobile">
    <div class="panel p-3.5" id="mobile-inv">
      <div class="mb-2 flex items-center justify-between">
        <div class="flex items-center gap-2"><h2 class="text-sm">Inventory</h2></div>
      </div>
      <div class="space-y-1.5">
        <div class="compact-row py-2" id="mobile-row"><button>Equipped</button></div>
      </div>
    </div>
    <div class="panel p-3.5" id="mobile-quests">
      <div class="mb-2"><h2 class="text-sm">Quests</h2></div>
      <div class="space-y-1.5">
        <div class="compact-row py-2" id="mobile-quest-row"><button>List</button></div>
      </div>
    </div>
  </section>

  <section class="grid gap-3 hidden xl:grid" id="desktop">
    <div class="panel p-3.5" id="desktop-inv">
      <div class="mb-2 flex items-center justify-between">
        <div class="flex items-center gap-2"><h2 class="text-sm">Inventory</h2></div>
        <div class="tools"><button aria-label="Filter"><svg></svg></button></div>
      </div>
      <div class="space-y-1.5">
        <div class="compact-row py-2" id="desktop-row"><button>Equipped</button></div>
      </div>
    </div>
    <div class="panel p-3.5" id="desktop-quests">
      <div class="mb-2"><h2 class="text-sm">Quests</h2></div>
      <div class="space-y-1.5">
        <div class="compact-row py-2" id="desktop-quest-row"><button>List</button></div>
      </div>
    </div>
  </section>
</body>`;

const dom = new JSDOM(html);
const d = dom.window.document;
const ROW_SELECTOR = '.compact-row, [class*="item-row"]';
const headingIsInventory = el =>
  String(el.textContent || '').trim().toLowerCase() === 'inventory';

// ---- the shipped (fixed) implementation ------------------------------------
function findInventoryRoot(row) {
  let cur = row;
  for (let depth = 0; cur && depth < 10; depth += 1, cur = cur.parentElement) {
    const aria = String(cur.getAttribute?.('aria-label') || '').trim().toLowerCase();
    if (aria === 'inventory') return cur;
  }
  const headings = [...d.querySelectorAll('h1, h2, h3, h4, [data-title]')]
    .filter(h => !h.closest(ROW_SELECTOR) && headingIsInventory(h));
  for (const heading of headings) {
    let node = heading.parentElement;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      if (!node.querySelector(ROW_SELECTOR)) continue;
      // This heading's panel. If it owns our row we are done; if not, the row
      // belongs to a different copy of the panel (the page ships a hidden
      // xl:hidden duplicate) so try the next heading rather than giving up.
      if (node.contains(row)) return node;
      break;
    }
  }
  return null;
}

// ---- the previous implementation, as the negative control ------------------
function findInventoryRootOld(row) {
  let cur = row;
  for (let depth = 0; cur && depth < 10; depth += 1, cur = cur.parentElement) {
    const headings = cur.querySelectorAll('h1, h2, h3, h4, [data-title]') || [];
    for (const h of headings) {
      if (h.closest(ROW_SELECTOR)) continue;
      if (headingIsInventory(h)) return cur;
    }
  }
  return null;
}

const id = el => (el ? (el.id || el.tagName.toLowerCase() + '.' + el.className) : 'null');

const cases = [
  ['desktop inventory row', 'desktop-row', 'desktop-inv'],
  ['mobile inventory row', 'mobile-row', 'mobile-inv'],
  ['desktop QUESTS row', 'desktop-quest-row', 'null'],
  ['mobile QUESTS row', 'mobile-quest-row', 'null'],
];

let fail = 0;
let oldWrong = 0;
console.log('case                       expected          fixed             previous');
console.log('-'.repeat(78));
for (const [label, rowId, expect] of cases) {
  const row = d.getElementById(rowId);
  const got = id(findInventoryRoot(row));
  const was = id(findInventoryRootOld(row));
  const ok = got === expect;
  if (!ok) fail += 1;
  if (was !== expect) oldWrong += 1;
  console.log(
    `${label.padEnd(26)} ${expect.padEnd(17)} ${(got + (ok ? '' : '  <-- FAIL')).padEnd(17)} ${was}`
  );
}

console.log('-'.repeat(78));
console.log(`previous implementation wrong on ${oldWrong}/${cases.length} cases` +
  (oldWrong > 0 ? '  (control works: this test can fail)' : '  *** control useless ***'));
if (oldWrong === 0) fail += 1;
console.log(fail === 0 ? '\nPASS' : `\nFAIL - ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
