import { AtlasService } from './AtlasService.js';
import { ItemDatabase } from './ItemDatabase.js';
import { rollCacheRewards, groupCacheRewards, cacheItemDetails, cacheStatLines } from './arcaneCacheRewards.js';

const node = (tag, className, text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const number = value => value.toLocaleString('en-US');

/** Owns only the modal's reward DOM. Paging changes presentation, never rolls. */
export function createCacheLootView(announce) {
  const rewards = node('ul', 'rewards');
  rewards.setAttribute('aria-label', 'Featured rewards');
  const empty = node('p', 'no-featured', 'Your haul is in the loot list below.');
  const summary = node('section', 'loot-summary');
  empty.hidden = true;
  summary.hidden = true;
  const pager = node('nav', 'reward-pager');
  pager.setAttribute('aria-label', 'Reward pages');
  const previous = node('button', 'page-prev', '‹');
  previous.type = 'button'; previous.setAttribute('aria-label', 'Previous rewards');
  const pageLabel = node('span', 'page-label');
  const next = node('button', 'page-next', '›');
  next.type = 'button'; next.setAttribute('aria-label', 'Next rewards');
  pager.append(previous, pageLabel, next);
  const list = node('section', 'loot-list');
  list.setAttribute('aria-label', 'Loot list');
  const listHeading = node('h2', '', 'Loot list');
  const commonGroup = node('section', 'loot-group loot-common');
  commonGroup.setAttribute('aria-label', 'Resources and supplies');
  const listRows = node('ul', 'loot-rows');
  commonGroup.append(node('h3', '', 'Resources & Supplies'), listRows);
  const rareGroup = node('section', 'loot-group loot-rare');
  rareGroup.setAttribute('aria-label', 'Rare loot');
  const rareRows = node('ul', 'loot-rows');
  rareGroup.append(node('h3', '', 'Rare Loot'), rareRows);
  list.append(listHeading, commonGroup, rareGroup);
  summary.append(pager, list);
  const narrow = matchMedia('(max-width: 640px)');
  let result = { cards:[], list:[] }, cards = [], icons = [], detailNodes = [];
  let page = 0, pageSize = narrow.matches ? 1 : 3, disposed = false;

  const refresh = () => {
    if (disposed) return;
    for (const { el, entry } of icons) {
      if (entry.kind !== 'currency' && AtlasService.paint(el, entry.icon)) el.textContent = '';
    }
    for (const { entry, description, requirement } of detailNodes) {
      const details = cacheItemDetails(entry, ItemDatabase.find(entry.icon));
      const lines = cacheStatLines(details.description);
      description.replaceChildren(...(lines.length ? lines : ['No description listed.']).map(line=>node('li', 'reward-stat', line)));
      requirement.textContent = details.requirement;
      requirement.hidden = !details.requirement;
    }
  };
  const showPage = (value, speak = false) => {
    const pages = Math.max(1, Math.ceil(cards.length / pageSize));
    page = Math.max(0, Math.min(value, pages - 1));
    const start = page * pageSize, shown = Math.min(pageSize, cards.length - start);
    cards.forEach((card, index) => {
      card.hidden = index < start || index >= start + pageSize;
      if (!card.hidden) {
        card.style.setProperty('--slot', index - start - (shown - 1) / 2);
        card.style.setProperty('--order', index - start);
      }
    });
    pageLabel.textContent = cards.length ? `${start + 1}–${start + shown} of ${cards.length} treasures` : '';
    previous.disabled = page === 0;
    next.disabled = page === pages - 1;
    pager.hidden = cards.length <= pageSize;
    if (speak) announce.textContent = pageLabel.textContent + '. ' + result.cards.slice(start, start + pageSize).map(x=>x.name).join(', ');
  };
  previous.addEventListener('click', () => showPage(page - 1, true));
  next.addEventListener('click', () => showPage(page + 1, true));
  const resize = () => {
    const first = page * pageSize;
    pageSize = narrow.matches ? 1 : 3;
    showPage(Math.floor(first / pageSize));
  };
  narrow.addEventListener('change', resize);
  document.addEventListener('iw:atlas-updated', refresh);
  document.addEventListener('iw:item-db-updated', refresh);
  AtlasService.ready().then(refresh).catch(() => {}); // fallback glyphs remain usable offline

  return {
    rewards, summary, empty,
    prepare(count) {
      result = groupCacheRewards(rollCacheRewards(count), count > 1);
      cards = []; icons = []; detailNodes = [];
      rewards.replaceChildren(); listRows.replaceChildren(); rareRows.replaceChildren();
      rewards.setAttribute('aria-hidden', 'true');
      summary.hidden = true; empty.hidden = true;
      for (const entry of result.cards) {
        const card = node('li', 'reward');
        card.dataset.rewardId = entry.id;
        card.dataset.rarity = entry.rarity;
        const face = node('article', 'reward-face');
        const head = node('div', 'reward-head');
        const icon = node('span', 'reward-icon', '✦');
        icon.setAttribute('aria-hidden', 'true');
        const identity = node('div', 'reward-identity');
        identity.append(node('h3', '', entry.name), node('span', 'sr-only', entry.rarity));
        head.append(identity, node('span', 'quantity', `×${number(entry.quantity)}`));
        const art = node('div', 'reward-art');
        art.append(icon);
        const description = node('ul', 'reward-description');
        description.setAttribute('aria-label', 'Item stats');
        const requirement = node('p', 'reward-requirement');
        face.append(head, art, description, requirement); card.append(face);
        cards.push(card); icons.push({ el:icon, entry });
        detailNodes.push({ entry, description, requirement }); rewards.append(card);
      }
      // A second view of the same stacks, never a second roll or award. Single
      // openings keep every card but use the same item/resource list grouping.
      const listed = count > 1 ? result : groupCacheRewards(result.cards, true);
      for (const [entries, rows] of [[listed.list,listRows], [listed.cards,rareRows]]) {
        for (const entry of entries) {
          const row = node('li', 'loot-row');
          row.dataset.rewardId = entry.id;
          row.dataset.quantity = String(entry.quantity);
          row.dataset.rarity = entry.rarity;
          const icon = node('span', entry.kind === 'currency' ? 'loot-icon gold-icon' : 'loot-icon', entry.kind === 'currency' ? '✦' : '◆');
          icon.setAttribute('aria-hidden', 'true');
          row.append(icon, node('span', 'loot-name', entry.name), node('span', 'loot-quantity', `×${number(entry.quantity)}`));
          rows.append(row); icons.push({ el:icon, entry });
        }
      }
      commonGroup.hidden = listed.list.length === 0;
      rareGroup.hidden = listed.cards.length === 0;
      list.hidden = commonGroup.hidden && rareGroup.hidden;
      showPage(0); refresh();
    },
    reveal() {
      rewards.removeAttribute('aria-hidden'); summary.hidden = false;
      empty.hidden = cards.length > 0;
      return [...result.cards,...result.list].map(x=>`${x.name}, ${number(x.quantity)}`).join('. ');
    },
    dispose() {
      disposed = true;
      narrow.removeEventListener('change', resize);
      document.removeEventListener('iw:atlas-updated', refresh);
      document.removeEventListener('iw:item-db-updated', refresh);
    },
  };
}
