// User Rated view: toolbar, per-user/aggregate sections, native Jellyfin cards.
import { getApiClient, apiFetch } from './core.js';

// jellyfin-web 12.3 webpack ids of the legacy cardBuilder module and its chunks.
// Ids hash the module path: stable across builds unless upstream moves the file.
const CARD_BUILDER_MODULE = 24468;
const CARD_BUILDER_CHUNKS = [45642, 24468, 66884];
const ITEMS_BATCH = 150;

async function fetchRatedItems(userId, parentId) {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (parentId) params.set('parentId', parentId);
    const qs = params.toString();
    return apiFetch(`/Ratings/RatedItems${qs ? '?' + qs : ''}`);
}

let cardBuilderPromise = null;

// Borrows webpack's own require through a no-op chunk push, then finds the export by shape
function getCardBuilder() {
    if (!cardBuilderPromise) {
        cardBuilderPromise = (async () => {
            let req = null;
            self.webpackChunk?.push([[Symbol('jellyrate')], {}, r => { req = r; }]);
            if (!req) return null;
            await Promise.all(CARD_BUILDER_CHUNKS.map(id => req.e(id)));
            return Object.values(req(CARD_BUILDER_MODULE)).find(x => typeof x?.buildCards === 'function') || null;
        })().catch(() => null);
    }
    return cardBuilderPromise;
}

// Full BaseItemDtos for cardBuilder, keyed by hyphenless id
async function fetchItemDtos(itemIds) {
    const api = getApiClient();
    const userId = api.getCurrentUserId();
    const ids = itemIds.map(id => id.replace(/-/g, ''));
    const dtos = new Map();
    for (let i = 0; i < ids.length; i += ITEMS_BATCH) {
        const result = await api.getItems(userId, {
            Ids: ids.slice(i, i + ITEMS_BATCH).join(','),
            Fields: 'PrimaryImageAspectRatio',
            EnableTotalRecordCount: false
        });
        for (const dto of (result?.Items || [])) dtos.set(dto.Id.replace(/-/g, ''), dto);
    }
    return dtos;
}

// ── Rated view state ──────────────────────────────────

let ratedViewItems = [];
let ratedViewDtos = new Map(); // hyphenless id -> BaseItemDto
let ratedViewCardBuilder = null;
let ratedViewAggregate = false;
let ratedViewEnabledUsers = {}; // userId string -> bool

export function removeRatedView() {
    document.documentElement.removeAttribute('data-jellyrate-rated');
    document.getElementById('jellyrate-ratedView')?.remove();
}

function ratingLine(rating, total) {
    return `★ ${rating.toFixed(1)} · ${total} vote${total !== 1 ? 's' : ''}`;
}

function getFilteredRatings(item) {
    return (item.UserRatings || []).filter(r => ratedViewEnabledUsers[r.UserId] !== false);
}

// [{ title, entries: [{ item, rating, total, ratings }] }] for the current mode and filters
function getRatedSections() {
    if (ratedViewAggregate) {
        const entries = [];
        for (const item of ratedViewItems) {
            const ratings = getFilteredRatings(item);
            if (ratings.length === 0) continue;
            const avg = ratings.reduce((s, r) => s + r.Rating, 0) / ratings.length;
            entries.push({ item, rating: avg, total: ratings.length, ratings });
        }
        entries.sort((a, b) => b.rating - a.rating);
        return entries.length ? [{ title: null, entries }] : [];
    }

    const userMap = new Map();
    for (const item of ratedViewItems) {
        for (const ur of (item.UserRatings || [])) {
            if (ratedViewEnabledUsers[ur.UserId] === false) continue;
            if (!userMap.has(ur.UserId)) userMap.set(ur.UserId, { title: ur.Username, entries: [] });
            userMap.get(ur.UserId).entries.push({
                item, rating: ur.Rating, total: 1, ratings: [{ Username: ur.Username, Rating: ur.Rating }]
            });
        }
    }
    const sections = [...userMap.values()].sort((a, b) => a.title.localeCompare(b.title));
    for (const s of sections) s.entries.sort((a, b) => b.rating - a.rating);
    return sections;
}

function appendSectionHeader(parent, title) {
    const header = document.createElement('div');
    header.className = 'jellyrate-user-section';
    header.textContent = title;
    parent.appendChild(header);
}

function renderNativeSections(wrapper, sections) {
    for (const { title, entries } of sections) {
        const shown = entries.filter(e => ratedViewDtos.has(e.item.ItemId.replace(/-/g, '')));
        if (shown.length === 0) continue;
        if (title) appendSectionHeader(wrapper, title);

        const lines = new Map(shown.map(e => [e.item.ItemId.replace(/-/g, ''), ratingLine(e.rating, e.total)]));
        const container = document.createElement('div');
        container.className = 'itemsContainer vertical-wrap padded-left padded-right';
        wrapper.appendChild(container); // buildCards skips containers not attached to the document

        ratedViewCardBuilder.buildCards(shown.map(e => ratedViewDtos.get(e.item.ItemId.replace(/-/g, ''))), {
            itemsContainer: container,
            shape: 'auto',
            showTitle: true,
            showYear: true,
            centerText: true,
            coverImage: true,
            overlayPlayButton: true,
            textLines: dto => [lines.get(dto.Id.replace(/-/g, '')) || '']
        });
    }
}

function renderRatedGrid(container) {
    container.querySelector('.jellyrate-rated-sections')?.remove();
    const wrapper = document.createElement('div');
    wrapper.className = 'jellyrate-rated-sections';
    container.appendChild(wrapper);

    if (!ratedViewItems.length) {
        wrapper.innerHTML = '<div class="jellyrate-rated-empty">No rated items in this library.</div>';
        return;
    }
    const sections = getRatedSections();
    if (!sections.length) {
        wrapper.innerHTML = '<div class="jellyrate-rated-empty">No rated items match the current filters.</div>';
        return;
    }
    renderNativeSections(wrapper, sections);
}

function renderRatedToolbar(container) {
    if (container.querySelector('.jellyrate-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'jellyrate-toolbar';

    // "Aggregate" toggle
    const toggle = document.createElement('button');
    toggle.className = 'jellyrate-toolbar-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Aggregate';
    toggle.addEventListener('click', () => {
        ratedViewAggregate = !ratedViewAggregate;
        toggle.classList.toggle('active', ratedViewAggregate);
        renderRatedGrid(container);
    });
    toolbar.appendChild(toggle);

    // User chips
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'jellyrate-chips';

    const userMap = new Map();
    for (const item of ratedViewItems) {
        for (const ur of (item.UserRatings || [])) {
            if (!userMap.has(ur.UserId)) userMap.set(ur.UserId, ur.Username);
        }
    }
    const sortedUsers = [...userMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

    for (const [userId, username] of sortedUsers) {
        if (ratedViewEnabledUsers[userId] === undefined) ratedViewEnabledUsers[userId] = true;

        const chip = document.createElement('button');
        chip.className = 'jellyrate-chip' + (ratedViewEnabledUsers[userId] ? '' : ' disabled');
        chip.type = 'button';
        chip.textContent = username;
        chip.dataset.userId = userId;

        chip.addEventListener('click', () => {
            ratedViewEnabledUsers[userId] = !ratedViewEnabledUsers[userId];
            chip.classList.toggle('disabled', !ratedViewEnabledUsers[userId]);
            renderRatedGrid(container);
        });

        chip.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const allOthersOff = sortedUsers.every(([id]) => id === userId || ratedViewEnabledUsers[id] === false);
            for (const [id] of sortedUsers) {
                ratedViewEnabledUsers[id] = allOthersOff ? true : (id === userId);
            }
            chipsContainer.querySelectorAll('.jellyrate-chip').forEach(c => {
                c.classList.toggle('disabled', ratedViewEnabledUsers[c.dataset.userId] === false);
            });
            renderRatedGrid(container);
        });

        chipsContainer.appendChild(chip);
    }

    toolbar.appendChild(chipsContainer);
    container.insertBefore(toolbar, container.firstChild);
}

export async function showRatedView(page, parentId) {
    removeRatedView();

    const view = document.createElement('div');
    view.id = 'jellyrate-ratedView';
    view.innerHTML = '<div class="jellyrate-rated-empty">Loading...</div>';
    page.appendChild(view);
    document.documentElement.setAttribute('data-jellyrate-rated', '');

    try {
        const items = await fetchRatedItems(null, parentId);
        ratedViewItems = items || [];
        ratedViewCardBuilder = await getCardBuilder();
        if (!ratedViewCardBuilder) throw new Error('Jellyfin card renderer not found');
        ratedViewDtos = await fetchItemDtos(ratedViewItems.map(i => i.ItemId));
        if (!view.isConnected) return;
        ratedViewAggregate = false;
        ratedViewEnabledUsers = {};
        view.innerHTML = '';
        renderRatedToolbar(view);
        renderRatedGrid(view);
    } catch (err) {
        view.innerHTML = `<div class="jellyrate-rated-empty">Failed to load: ${err.message}</div>`;
    }
}
