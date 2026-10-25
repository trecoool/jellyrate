(function () {
    'use strict';

    const POLL_INTERVAL = 500;
    const INIT_TIMEOUT = 2000;
    const ID_REGEX = /id=([a-f0-9]{32}|[a-f0-9-]{36})/i;
    const DETAIL_RETRY_MAX = 15;
    const DETAIL_RETRY_INTERVAL = 400;

    let config = null;
    let lastUrl = '';
    let currentItemId = null;
    let stylesInjected = false;
    let allStatsCache = null;
    let allStatsCacheTime = 0;
    const STATS_CACHE_TTL = 60000; // 1 minute
    const detailedRatingsCache = new Map(); // itemId -> [{ Rating, Username }]

    // ── Styles ──────────────────────────────────────────────

    function injectStyles() {
        if (stylesInjected || document.getElementById('jellyrate-styles')) return;
        const style = document.createElement('style');
        style.id = 'jellyrate-styles';
        style.textContent = `
            .jellyrate-container {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 0;
                flex-wrap: wrap;
            }
            .jellyrate-stars {
                display: inline-flex;
                gap: 2px;
                cursor: pointer;
            }
            .jellyrate-star {
                font-size: 1.5em;
                color: #555;
                transition: color 0.15s, transform 0.15s;
                user-select: none;
                line-height: 1;
            }
            .jellyrate-star:hover,
            .jellyrate-star.hovered {
                transform: scale(1.15);
            }
            .jellyrate-star.active {
                color: #e6c419;
            }
            .jellyrate-star.hovered {
                color: #f0d040;
            }
            .jellyrate-stats {
                color: rgba(255,255,255,0.6);
                font-size: 0.9em;
            }
            .jellyrate-tooltip-anchor {
                cursor: pointer;
            }
            .jellyrate-tooltip {
                position: fixed;
                background: rgba(20, 20, 20, 0.95);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                padding: 6px 10px;
                white-space: nowrap;
                z-index: 10000;
                font-size: 0.85em;
                color: rgba(255,255,255,0.85);
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                line-height: 1.6;
            }

            /* Media info row style — matches Jellyfin's Video/Audio/Subtitles layout */
            .jellyrate-info-row {
                display: flex;
                align-items: center;
                padding: 0.25em 0;
                margin-left: 2em;
                padding-left: 2em;
                margin-top: 0.75em;
            }
            .jellyrate-info-label {
                flex-shrink: 0;
                width: 8em;
                color: rgba(255,255,255,0.6);
                font-size: inherit;
            }
            .jellyrate-info-value {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
                flex: 1;
            }

            /* Card overlay badge */
            .jellyrate-card-badge {
                position: absolute;
                top: 4px;
                right: 4px;
                background: rgba(0,0,0,0.75);
                color: #e6c419;
                font-size: 0.75em;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
                z-index: 2;
                display: flex;
                align-items: center;
                gap: 3px;
                line-height: 1.2;
            }
            .jellyrate-card-badge .star {
                font-size: 1em;
            }

            /* User Rated view content */
            .jellyrate-rated-empty {
                padding: 2em;
                color: rgba(255,255,255,0.5);
                font-size: 0.95em;
            }

            /* Rated view toolbar */
            .jellyrate-toolbar {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 0.75em 1em;
            }
            .jellyrate-toolbar-toggle {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 0.3em 0.8em;
                background: rgba(255,255,255,0.08);
                color: rgba(255,255,255,0.7);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.85em;
                font-family: inherit;
                white-space: nowrap;
                transition: background 0.15s, border-color 0.15s, color 0.15s;
            }
            .jellyrate-toolbar-toggle.active {
                background: rgba(230, 196, 25, 0.15);
                color: #e6c419;
                border-color: rgba(230, 196, 25, 0.4);
            }
            .jellyrate-toolbar-toggle:hover {
                background: rgba(255,255,255,0.12);
            }
            .jellyrate-chips {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                justify-content: center;
            }
            .jellyrate-chip {
                display: inline-flex;
                align-items: center;
                padding: 0.3em 0.8em;
                background: rgba(230, 196, 25, 0.15);
                color: #e6c419;
                border: 1px solid rgba(230, 196, 25, 0.4);
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.85em;
                font-family: inherit;
                user-select: none;
                transition: background 0.15s, color 0.15s, border-color 0.15s;
            }
            .jellyrate-chip:hover {
                background: rgba(230, 196, 25, 0.25);
            }
            .jellyrate-chip.disabled {
                background: rgba(255,255,255,0.08);
                color: rgba(255,255,255,0.7);
                border-color: rgba(255,255,255,0.15);
            }
            .jellyrate-chip.disabled:hover {
                background: rgba(255,255,255,0.12);
            }

            /* By-user section headers */
            .jellyrate-user-section {
                padding: 0.5em 1em;
                margin-top: 0.5em;
                font-size: 1em;
                font-weight: bold;
                color: rgba(255,255,255,0.8);
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }

            /* "User Rated" button in the library AppBar row. The slot takes the free space
               and the native sibling after it stops growing, so the button sits centered */
            .jellyrate-rated-slot {
                flex: 1 1 0;
                min-width: 0;
                display: flex;
                justify-content: center;
            }
            .jellyrate-rated-slot + * {
                flex-grow: 0 !important;
            }
            .jellyrate-rated-btn {
                padding: 0.4em 1em;
                background: none;
                color: #e6c419;
                border: 1px solid transparent;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
                font-weight: bold;
                font-family: inherit;
                white-space: nowrap;
            }
            .jellyrate-rated-btn:hover {
                opacity: 0.7;
            }
            .jellyrate-rated-btn.active {
                background: rgba(230, 196, 25, 0.15);
                border-color: rgba(230, 196, 25, 0.4);
            }

            /* Rated view: native page content hidden by a marker we own, React nodes untouched */
            html[data-jellyrate-rated] .libraryPage > :not(#jellyrate-ratedView) {
                display: none !important;
            }
            .jellyrate-rated-sections .itemsContainer {
                margin-bottom: 1em;
            }

        `;
        document.head.appendChild(style);
        stylesInjected = true;
    }

    // ── API helpers ─────────────────────────────────────────

    function getApiClient() { return window.ApiClient || null; }

    function getAuthHeader() {
        const api = getApiClient();
        if (!api) return null;
        const token = typeof api.accessToken === 'function' ? api.accessToken() : api._serverInfo?.AccessToken;
        const deviceId = typeof api.deviceId === 'function' ? api.deviceId() : api._deviceId;
        const deviceName = typeof api.deviceName === 'function' ? api.deviceName() : api._deviceName || 'JellyRate';
        const clientName = typeof api.appName === 'function' ? api.appName() : 'JellyRate';
        const clientVersion = typeof api.appVersion === 'function' ? api.appVersion() : '1.0.0';
        if (!token) return null;
        return `MediaBrowser Client="${clientName}", Device="${deviceName}", DeviceId="${deviceId}", Version="${clientVersion}", Token="${token}"`;
    }

    function getBaseUrl() {
        const api = getApiClient();
        if (!api) return '';
        const addr = typeof api.serverAddress === 'function' ? api.serverAddress() : api._serverAddress || '';
        return addr.replace(/\/$/, '');
    }

    async function apiFetch(path, options = {}) {
        const base = getBaseUrl();
        const auth = getAuthHeader();
        const headers = { ...(options.headers || {}) };
        if (auth) headers.Authorization = auth;
        if (options.body) headers['Content-Type'] = 'application/json';
        const resp = await fetch(`${base}${path}`, { ...options, headers });
        if (!resp.ok) throw new Error(`API ${resp.status}`);
        if (resp.status === 204) return null;
        const text = await resp.text();
        return text ? JSON.parse(text) : null;
    }

    async function fetchConfig() {
        if (config) return config;
        config = await apiFetch('/Ratings/Config');
        return config;
    }

    async function fetchStats(itemId) { return apiFetch(`/Ratings/Items/${itemId}/Stats`); }
    async function submitRating(itemId, rating) { return apiFetch(`/Ratings/Items/${itemId}/Rating?rating=${rating}`, { method: 'POST' }); }
    async function deleteRating(itemId) { return apiFetch(`/Ratings/Items/${itemId}/Rating`, { method: 'DELETE' }); }
    async function fetchDetailedRatings(itemId) { return apiFetch(`/Ratings/Items/${itemId}/DetailedRatings`); }

    async function fetchAllStats() {
        const now = Date.now();
        if (allStatsCache && (now - allStatsCacheTime) < STATS_CACHE_TTL) return allStatsCache;
        allStatsCache = await apiFetch('/Ratings/AllStats');
        allStatsCacheTime = now;
        return allStatsCache;
    }

    // Invalidate bulk cache after a rating change so cards refresh
    function invalidateStatsCache() {
        allStatsCache = null;
        allStatsCacheTime = 0;
        detailedRatingsCache.clear();
    }

    async function fetchDetailedRatingsCached(itemId) {
        if (!detailedRatingsCache.has(itemId)) detailedRatingsCache.set(itemId, await fetchDetailedRatings(itemId));
        return detailedRatingsCache.get(itemId);
    }

    // ── Per-user ratings popover (hover with mouse, tap/click toggles) ──

    let openTooltip = null; // { anchor, el, viaHover }

    function closeRatingsTooltip() {
        if (!openTooltip) return;
        if (openTooltip.el) openTooltip.el.remove();
        openTooltip = null;
    }

    // Lives on <body> with fixed position so overflow:hidden card containers can't clip it
    async function showRatingsTooltip(anchorEl, loadRatings, viaHover) {
        closeRatingsTooltip();
        const entry = { anchor: anchorEl, el: null, viaHover };
        openTooltip = entry;
        let ratings;
        try { ratings = await loadRatings(); } catch { ratings = null; }
        if (openTooltip !== entry || !ratings || ratings.length === 0) return;

        const el = document.createElement('div');
        el.className = 'jellyrate-tooltip';
        ratings.slice().sort((a, b) => b.Rating - a.Rating).forEach(r => {
            const line = document.createElement('div');
            line.textContent = `${r.Rating}⭐ ${r.Username}`;
            el.appendChild(line);
        });
        document.body.appendChild(el);

        const rect = anchorEl.getBoundingClientRect();
        const fitsAbove = rect.top >= el.offsetHeight + 8;
        el.style.top = `${fitsAbove ? rect.top - el.offsetHeight - 6 : rect.bottom + 6}px`;
        el.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - el.offsetWidth - 4))}px`;
        entry.el = el;
    }

    // anchorEl: mouse hover zone + popover position; tapEl: click/tap toggle (defaults to anchorEl)
    function attachRatingsTooltip(anchorEl, loadRatings, tapEl = anchorEl) {
        tapEl.classList.add('jellyrate-tooltip-anchor');
        anchorEl.addEventListener('pointerenter', (e) => {
            if (e.pointerType === 'mouse') showRatingsTooltip(anchorEl, loadRatings, true);
        });
        anchorEl.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'mouse' && openTooltip?.anchor === anchorEl) closeRatingsTooltip();
        });
        // Click must not reach the card link underneath (would navigate instead of showing the popover)
        tapEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (openTooltip?.anchor !== anchorEl) showRatingsTooltip(anchorEl, loadRatings, false);
            else if (!openTooltip.viaHover) closeRatingsTooltip();
        });
    }

    document.addEventListener('click', closeRatingsTooltip);
    window.addEventListener('scroll', closeRatingsTooltip, { capture: true, passive: true });
    window.addEventListener('hashchange', closeRatingsTooltip);

    // ── Widget rendering ────────────────────────────────────

    function createWidget(container, cfg) {
        container.innerHTML = '';
        const starsDiv = document.createElement('div');
        starsDiv.className = 'jellyrate-stars';
        for (let i = cfg.MinRating; i <= cfg.MaxRating; i++) {
            const star = document.createElement('span');
            star.className = 'jellyrate-star';
            star.dataset.value = i;
            star.textContent = '\u2605';
            starsDiv.appendChild(star);
        }
        const statsDiv = document.createElement('div');
        statsDiv.className = 'jellyrate-stats';
        container.appendChild(starsDiv);
        container.appendChild(statsDiv);
        return { starsDiv, statsDiv };
    }

    function updateStars(starsDiv, activeValue) {
        starsDiv.querySelectorAll('.jellyrate-star').forEach(star => {
            const val = parseInt(star.dataset.value, 10);
            star.classList.toggle('active', val <= activeValue);
        });
    }

    function updateStats(statsDiv, stats, maxRating) {
        if (!stats || stats.TotalRatings === 0) { statsDiv.textContent = 'No ratings yet'; return; }
        statsDiv.textContent = `${stats.AverageRating.toFixed(1)}/${maxRating} \u2014 ${stats.TotalRatings} User rating${stats.TotalRatings !== 1 ? 's' : ''}`;
    }


    // ── Detail page handler ─────────────────────────────────

    function findAnchorElement(detailPage) {
        // Primary: insert right after .detailRibbon (the action buttons bar)
        const ribbon = detailPage.querySelector('.detailRibbon');
        if (ribbon) return { container: ribbon.parentElement, mode: 'after', ref: ribbon };

        // Fallback: title element
        const title = detailPage.querySelector('.itemName, h3, h1');
        if (title) return { container: title.parentElement, mode: 'after', ref: title };

        return null;
    }

    async function handleDetailPage(itemId, attempt = 0) {
        const detailPage = document.querySelector('.itemDetailPage:not(.hide)');
        if (!detailPage) return;

        const anchor = findAnchorElement(detailPage);
        if (!anchor) {
            if (attempt < DETAIL_RETRY_MAX) {
                setTimeout(() => handleDetailPage(itemId, attempt + 1), DETAIL_RETRY_INTERVAL);
            }
            return;
        }

        const parentEl = anchor.container;

        // Don't re-inject for same item
        let existing = parentEl.querySelector('.jellyrate-info-row');
        if (existing && existing.dataset.itemId === itemId) return;
        if (existing) existing.remove();
        // Also check globally in the detail page
        const globalExisting = detailPage.querySelector('.jellyrate-info-row');
        if (globalExisting && globalExisting.dataset.itemId === itemId) return;
        if (globalExisting) globalExisting.remove();

        const cfg = await fetchConfig();
        if (!cfg || !cfg.EnableRatings) return;

        // Build the rating row (matches Video/Audio/Subtitles style)
        const row = document.createElement('div');
        row.className = 'jellyrate-info-row';
        row.dataset.itemId = itemId;

        const label = document.createElement('div');
        label.className = 'jellyrate-info-label';
        label.textContent = 'Rating';

        const value = document.createElement('div');
        value.className = 'jellyrate-info-value';

        const container = document.createElement('div');
        container.className = 'jellyrate-container';
        container.style.padding = '0';

        const { starsDiv, statsDiv } = createWidget(container, cfg);

        value.appendChild(container);
        row.appendChild(label);
        row.appendChild(value);

        // Insert based on anchor strategy
        if (anchor.mode === 'before-first-child') {
            parentEl.insertBefore(row, parentEl.firstChild);
        } else if (anchor.mode === 'after' && anchor.ref) {
            anchor.ref.parentElement.insertBefore(row, anchor.ref.nextSibling);
        } else {
            parentEl.appendChild(row);
        }

        // Load stats
        let stats;
        try {
            stats = await fetchStats(itemId);
        } catch {
            statsDiv.textContent = '';
            return;
        }

        container._averageRating = Math.round(stats?.AverageRating ?? 0);
        container._currentUserRating = stats?.UserRating ?? 0;
        updateStars(starsDiv, container._averageRating);
        updateStats(statsDiv, stats, cfg.MaxRating);

        attachRatingsTooltip(statsDiv, () => fetchDetailedRatingsCached(itemId));

        // Star hover — preview selection
        starsDiv.addEventListener('mouseover', (e) => {
            const star = e.target.closest('.jellyrate-star');
            if (!star) return;
            const hoverVal = parseInt(star.dataset.value, 10);
            starsDiv.querySelectorAll('.jellyrate-star').forEach(s => {
                const v = parseInt(s.dataset.value, 10);
                s.classList.toggle('hovered', v <= hoverVal);
                s.classList.remove('active');
            });
        });

        // Star mouse leave — revert to average
        starsDiv.addEventListener('mouseleave', () => {
            starsDiv.querySelectorAll('.jellyrate-star').forEach(s => {
                s.classList.remove('hovered');
                s.classList.toggle('active', parseInt(s.dataset.value, 10) <= container._averageRating);
            });
        });

        // Click — submit rating
        starsDiv.addEventListener('click', async (e) => {
            const star = e.target.closest('.jellyrate-star');
            if (!star) return;
            const clickedValue = parseInt(star.dataset.value, 10);
            const isToggle = clickedValue === container._currentUserRating;

            // Optimistic UI — show clicked value immediately
            container._currentUserRating = isToggle ? 0 : clickedValue;
            updateStars(starsDiv, isToggle ? container._averageRating : clickedValue);

            try {
                if (isToggle) { await deleteRating(itemId); } else { await submitRating(itemId, clickedValue); }
                invalidateStatsCache();
                const freshStats = await fetchStats(itemId);
                container._currentUserRating = freshStats?.UserRating ?? 0;
                container._averageRating = Math.round(freshStats?.AverageRating ?? 0);
                updateStars(starsDiv, container._averageRating);
                updateStats(statsDiv, freshStats, cfg.MaxRating);
                processVisibleCards();
            } catch {
                try {
                    const revert = await fetchStats(itemId);
                    container._currentUserRating = revert?.UserRating ?? 0;
                    container._averageRating = Math.round(revert?.AverageRating ?? 0);
                    updateStars(starsDiv, container._averageRating);
                    updateStats(statsDiv, revert, cfg.MaxRating);
                } catch { /* silent */ }
            }
        });
    }

    // ── Library card overlays ───────────────────────────────

    let cardProcessTimer = null;

    function getItemIdFromCard(card) {
        // Try data attributes first
        const dataId = card.getAttribute('data-id') || card.getAttribute('data-itemid');
        if (dataId) return dataId;

        // Try link href
        const link = card.querySelector('a[href*="id="]');
        if (link) {
            const match = link.href.match(ID_REGEX);
            if (match) return match[1];
        }

        // Try the card's own onclick or parent link
        const parentLink = card.closest('a[href*="id="]') || card.querySelector('a[is="emby-linkbutton"]');
        if (parentLink) {
            const match2 = (parentLink.href || '').match(ID_REGEX);
            if (match2) return match2[1];
        }

        return null;
    }

    async function processVisibleCards() {
        const cards = document.querySelectorAll('.card:not([data-jellyrate-processed])');
        if (cards.length === 0) return;

        let stats;
        try {
            stats = await fetchAllStats();
        } catch {
            return;
        }
        if (!stats) return;

        cards.forEach(card => {
            card.setAttribute('data-jellyrate-processed', '1');

            // Skip library/collection cards — only badge actual video items
            const dataType = card.getAttribute('data-type') || card.getAttribute('data-collectiontype') || '';
            if (['CollectionFolder', 'UserView', 'Folder', 'ManualPlaylistsFolder', 'Channel'].includes(dataType)) return;
            // Also skip if the card links to a library view rather than an item detail
            const cardLink = card.querySelector('a[href]') || card.closest('a[href]');
            if (cardLink) {
                const href = cardLink.getAttribute('href') || '';
                if (!href.includes('id=')) return;
            }

            const itemId = getItemIdFromCard(card);
            if (!itemId) return;

            // Normalize: stats keys might be with or without hyphens
            const normalizedId = itemId.replace(/-/g, '');
            let itemStats = null;
            for (const [key, val] of Object.entries(stats)) {
                if (key.replace(/-/g, '') === normalizedId) {
                    itemStats = val;
                    break;
                }
            }

            if (!itemStats || itemStats.TotalRatings === 0) return;

            // Badge goes in .cardScalable, after Jellyfin's hover overlay: inside .cardImageContainer
            // (contain: strict) it would be trapped under the overlay's darkening and pointer layer
            const imgContainer = card.querySelector('.cardScalable') || card.querySelector('.cardBox') || card;

            // Don't add duplicate badge
            if (imgContainer.querySelector('.jellyrate-card-badge')) return;

            // Ensure relative positioning for absolute badge
            const pos = getComputedStyle(imgContainer).position;
            if (pos === 'static') imgContainer.style.position = 'relative';

            const badge = document.createElement('div');
            badge.className = 'jellyrate-card-badge';
            badge.innerHTML = `<span class="star">\u2605</span> ${itemStats.AverageRating.toFixed(1)}`;
            // Mouse: hover anywhere on the card; touch: tap the badge
            const hoverZone = card.querySelector('.cardBox') || card;
            attachRatingsTooltip(hoverZone, () => fetchDetailedRatingsCached(itemId), badge);
            imgContainer.appendChild(badge);
        });
    }

    function scheduleCardProcessing() {
        if (cardProcessTimer) clearTimeout(cardProcessTimer);
        cardProcessTimer = setTimeout(processVisibleCards, 300);
    }

    function setupCardObserver() {
        const observer = new MutationObserver((mutations) => {
            let hasNewCards = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && (node.classList?.contains('card') || node.querySelector?.('.card'))) {
                        hasNewCards = true;
                        break;
                    }
                }
                if (hasNewCards) break;
            }
            if (hasNewCards) scheduleCardProcessing();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Also process on navigation
        window.addEventListener('hashchange', () => {
            // Reset processed markers on navigation since cards are re-rendered
            setTimeout(() => {
                document.querySelectorAll('[data-jellyrate-processed]').forEach(el => el.removeAttribute('data-jellyrate-processed'));
                scheduleCardProcessing();
            }, 500);
        });
    }

    // ── "User Rated" button on library pages ──────────────────

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

    // Rendered, not just present: JF12 keeps hidden legacy pages and headers in the DOM.
    function isRendered(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function getLibraryParentId() {
        const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
        return urlParams.get('topParentId');
    }

    function findLibraryPage() {
        if (!getLibraryParentId()) return null;
        return Array.from(document.querySelectorAll('.libraryPage')).find(isRendered) || null;
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

    function removeRatedView() {
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

    async function showRatedView(page, parentId) {
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

    // Toolbar row under the AppBar holding the library view dropdown:
    // [dropdown] [count box] [play/sort stack]. Count box is row-reverse on narrow screens.
    function findLibraryToolbarAnchors() {
        const dropdown = Array.from(document.querySelectorAll('button[aria-controls="library-view-menu"]'))
            .find(el => isRendered(el) && !el.closest('.osdHeader'));
        if (!dropdown || !dropdown.parentElement) return null;
        let countBox = dropdown.nextElementSibling;
        if (countBox?.classList.contains('jellyrate-rated-slot')) countBox = countBox.nextElementSibling;
        return { toolbar: dropdown.parentElement, dropdown, countBox };
    }

    // Narrow: between dropdown and count (count is pushed right). Wide: after the count,
    // before the play/sort stack. Moves only when misplaced, so our own mutation settles.
    function placeRatedSlot(slot, anchors) {
        const { toolbar, dropdown, countBox } = anchors;
        if (!countBox) {
            if (slot.previousElementSibling !== dropdown || slot.parentElement !== toolbar) dropdown.after(slot);
            return;
        }
        const narrow = getComputedStyle(countBox).flexDirection === 'row-reverse';
        if (narrow && slot.nextElementSibling !== countBox) countBox.before(slot);
        else if (!narrow && slot.previousElementSibling !== countBox) countBox.after(slot);
    }

    function createRatedSlot() {
        const slot = document.createElement('div');
        slot.className = 'jellyrate-rated-slot';
        const btn = document.createElement('button');
        btn.className = 'jellyrate-rated-btn';
        btn.type = 'button';
        btn.textContent = '⭐ User Rated';
        btn.addEventListener('click', () => {
            if (history.state?.jellyrate === 'rated') { history.back(); return; }
            // Keep react-router's own state (idx, key) so its back/forward deltas stay correct
            history.pushState({ ...history.state, jellyrate: 'rated', parentId: getLibraryParentId() }, '');
            scheduleRatedSync();
        });
        slot.appendChild(btn);
        return slot;
    }

    // Enabled in config and at least one rating exists (stats are cached for a minute)
    async function isRatedFeatureEnabled() {
        try {
            const cfg = await fetchConfig();
            if (!cfg || cfg.DisableUserRatedTab) return false;
            const stats = await fetchAllStats();
            return !!stats && Object.keys(stats).length > 0;
        } catch { return false; }
    }

    let ratedSyncRunning = false;
    let ratedSyncPending = false;

    // Single reconcile pass: slot placement + rated view shown iff history state says so
    async function syncRatedUi() {
        if (ratedSyncRunning) { ratedSyncPending = true; return; }
        ratedSyncRunning = true;
        try {
            const page = findLibraryPage();
            if (!page || !(await isRatedFeatureEnabled())) {
                removeRatedView();
                document.querySelector('.jellyrate-rated-slot')?.remove();
                return;
            }

            const anchors = findLibraryToolbarAnchors();
            let slot = document.querySelector('.jellyrate-rated-slot');
            if (anchors) {
                if (!slot) slot = createRatedSlot();
                placeRatedSlot(slot, anchors);
            }

            const shouldShow = history.state?.jellyrate === 'rated';
            const view = document.getElementById('jellyrate-ratedView');
            slot?.firstChild.classList.toggle('active', shouldShow);

            if (shouldShow && (!view || view.parentElement !== page)) {
                showRatedView(page, history.state.parentId);
            } else if (!shouldShow && view) {
                removeRatedView();
            }
        } finally {
            ratedSyncRunning = false;
            if (ratedSyncPending) { ratedSyncPending = false; scheduleRatedSync(); }
        }
    }

    let ratedSyncScheduled = false;

    function scheduleRatedSync() {
        if (ratedSyncScheduled) return;
        ratedSyncScheduled = true;
        requestAnimationFrame(() => { ratedSyncScheduled = false; syncRatedUi(); });
    }

    // The AppBar and library page are React subtrees that remount on navigation
    function watchRatedUi() {
        new MutationObserver(scheduleRatedSync).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('popstate', scheduleRatedSync);
        window.addEventListener('resize', scheduleRatedSync);
        scheduleRatedSync();
    }

    // ── SPA Navigation Detection ────────────────────────────

    function getItemIdFromUrl() {
        const match = location.href.match(ID_REGEX);
        return match ? match[1] : null;
    }

    function checkNavigation() {
        const url = location.href;
        if (url === lastUrl) return;
        lastUrl = url;

        const itemId = getItemIdFromUrl();
        if (!itemId) { currentItemId = null; return; }
        if (itemId !== currentItemId) {
            currentItemId = itemId;
            setTimeout(() => handleDetailPage(itemId), 200);
        }
    }

    // ── Init ────────────────────────────────────────────────

    function init() {
        injectStyles();
        window.addEventListener('hashchange', checkNavigation);
        window.addEventListener('popstate', checkNavigation);
        setInterval(checkNavigation, POLL_INTERVAL);
        checkNavigation();

        // Library card overlays
        setupCardObserver();
        scheduleCardProcessing();

        // "User Rated" button in the library AppBar row + rated view
        watchRatedUi();
    }

    function waitForApiClient() {
        if (getApiClient()) { init(); return; }
        const start = Date.now();
        const interval = setInterval(() => {
            if (getApiClient() || Date.now() - start > INIT_TIMEOUT) {
                clearInterval(interval);
                init();
            }
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForApiClient);
    } else {
        waitForApiClient();
    }
})();
