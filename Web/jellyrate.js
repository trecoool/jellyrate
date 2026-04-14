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
            .jellyrate-tooltip {
                position: absolute;
                bottom: calc(100% + 6px);
                left: 0;
                background: rgba(20, 20, 20, 0.95);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                padding: 6px 10px;
                white-space: nowrap;
                z-index: 100;
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
                pointer-events: none;
                z-index: 1;
                display: flex;
                align-items: center;
                gap: 3px;
                line-height: 1.2;
            }
            .jellyrate-card-badge .star {
                font-size: 1em;
            }

            /* User Rated view content */
            .jellyrate-rated-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                padding: 1em;
                gap: 1em;
            }
            .jellyrate-rated-card {
                cursor: pointer;
                text-decoration: none;
                color: inherit;
                transition: transform 0.15s;
            }
            .jellyrate-rated-card:hover {
                transform: scale(1.04);
            }
            .jellyrate-rated-poster {
                width: 100%;
                aspect-ratio: 2 / 3;
                border-radius: 4px;
                object-fit: cover;
                background: #1a1a1a;
            }
            .jellyrate-rated-poster.no-image {
                display: flex;
                align-items: center;
                justify-content: center;
                color: rgba(255,255,255,0.3);
                font-size: 0.85em;
                text-align: center;
                padding: 1em;
            }
            .jellyrate-rated-title {
                margin-top: 6px;
                font-size: 0.9em;
                line-height: 1.3;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .jellyrate-rated-sub {
                font-size: 0.8em;
                color: rgba(255,255,255,0.5);
                position: relative;
                cursor: default;
            }
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
                grid-column: 1 / -1;
                padding: 0.5em 1em;
                margin-top: 0.5em;
                font-size: 1em;
                font-weight: bold;
                color: rgba(255,255,255,0.8);
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }

            /* Card tooltip (reused pattern from detail page) */
            .jellyrate-card-tooltip {
                position: absolute;
                bottom: calc(100% + 4px);
                left: 0;
                background: rgba(20, 20, 20, 0.95);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                padding: 6px 10px;
                white-space: nowrap;
                z-index: 100;
                font-size: 0.85em;
                color: rgba(255,255,255,0.85);
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                line-height: 1.6;
            }

            /* "User Rated" button on library pages */
            .jellyrate-rated-btn {
                display: block;
                width: fit-content;
                margin: 0.5em auto;
                padding: 0.4em 1em;
                background: none;
                color: #e6c419;
                border: none;
                cursor: pointer;
                font-size: 0.9em;
                font-weight: bold;
                font-family: inherit;
            }
            .jellyrate-rated-btn:hover {
                opacity: 0.7;
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
        if (auth) headers['X-Emby-Authorization'] = auth;
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
    }

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
        statsDiv.style.position = 'relative';
        statsDiv.style.cursor = 'default';
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

        // Tooltip: show per-user ratings on stats hover
        let tooltipEl = null;
        let detailedCache = null;

        statsDiv.addEventListener('mouseenter', async () => {
            if (!detailedCache) {
                try { detailedCache = await fetchDetailedRatings(itemId); } catch { return; }
            }
            if (!detailedCache || detailedCache.length === 0) return;
            if (tooltipEl) tooltipEl.remove();
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'jellyrate-tooltip';
            tooltipEl.innerHTML = detailedCache
                .map(d => `<div>${d.Rating}\u2B50 ${d.Username}</div>`)
                .join('');
            statsDiv.appendChild(tooltipEl);
        });

        statsDiv.addEventListener('mouseleave', () => {
            if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
        });

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
                detailedCache = null;
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

            // Find the card's image container to position the badge
            const imgContainer = card.querySelector('.cardImageContainer') || card.querySelector('.cardBox') || card;

            // Don't add duplicate badge
            if (imgContainer.querySelector('.jellyrate-card-badge')) return;

            // Ensure relative positioning for absolute badge
            const pos = getComputedStyle(imgContainer).position;
            if (pos === 'static') imgContainer.style.position = 'relative';

            const badge = document.createElement('div');
            badge.className = 'jellyrate-card-badge';
            badge.innerHTML = `<span class="star">\u2605</span> ${itemStats.AverageRating.toFixed(1)}`;
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

    async function fetchRatedItems(userId, parentId) {
        const params = new URLSearchParams();
        if (userId) params.set('userId', userId);
        if (parentId) params.set('parentId', parentId);
        const qs = params.toString();
        return apiFetch(`/Ratings/RatedItems${qs ? '?' + qs : ''}`);
    }

    function isLibraryPage() {
        const hash = location.hash.toLowerCase();
        return hash.includes('movies') || hash.includes('list.html')
            || hash.includes('music') || hash.includes('tvshows')
            || hash.includes('homevideos');
    }

    function getLibraryParentId() {
        const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
        return urlParams.get('topParentId');
    }

    function removeRatedView() {
        const view = document.getElementById('jellyrate-ratedView');
        if (!view) return;

        // Restore siblings we hid
        const parent = view.parentElement;
        if (parent) {
            parent.querySelectorAll('[data-jellyrate-hidden]').forEach(el => {
                el.style.display = el.getAttribute('data-jellyrate-hidden');
                el.removeAttribute('data-jellyrate-hidden');
            });
        }
        view.remove();
    }

    // ── Rated view state ──────────────────────────────────

    let ratedViewItems = [];
    let ratedViewAggregate = false;
    let ratedViewEnabledUsers = {}; // userId string -> bool

    function buildRatedCard(item, avgRating, totalRatings, userRatings) {
        const base = getBaseUrl();
        const card = document.createElement('a');
        card.className = 'jellyrate-rated-card';
        card.href = `#!/details?id=${item.ItemId}`;

        if (item.HasPrimaryImage) {
            const img = document.createElement('img');
            img.className = 'jellyrate-rated-poster';
            img.src = `${base}/Items/${item.ItemId}/Images/Primary?maxHeight=450&quality=90`;
            img.alt = item.Name;
            img.loading = 'lazy';
            card.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'jellyrate-rated-poster no-image';
            placeholder.textContent = item.Name;
            card.appendChild(placeholder);
        }

        const title = document.createElement('div');
        title.className = 'jellyrate-rated-title';
        title.textContent = item.Name;
        card.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'jellyrate-rated-sub';
        const year = item.ProductionYear ? `${item.ProductionYear} \u00b7 ` : '';
        sub.textContent = `${year}\u2605 ${avgRating.toFixed(1)} \u00b7 ${totalRatings} vote${totalRatings !== 1 ? 's' : ''}`;

        // Tooltip on hover — per-user ratings
        if (userRatings && userRatings.length > 0) {
            let tooltipEl = null;
            sub.addEventListener('mouseenter', () => {
                if (tooltipEl) tooltipEl.remove();
                tooltipEl = document.createElement('div');
                tooltipEl.className = 'jellyrate-card-tooltip';
                tooltipEl.innerHTML = userRatings
                    .slice().sort((a, b) => b.Rating - a.Rating)
                    .map(r => `<div>${r.Rating}\u2B50 ${r.Username}</div>`)
                    .join('');
                sub.appendChild(tooltipEl);
            });
            sub.addEventListener('mouseleave', () => {
                if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
            });
        }

        card.appendChild(sub);
        return card;
    }

    function getFilteredRatings(item) {
        return (item.UserRatings || []).filter(r => ratedViewEnabledUsers[r.UserId] !== false);
    }

    function renderRatedGrid(container) {
        let grid = container.querySelector('.jellyrate-rated-grid');
        if (grid) grid.remove();
        grid = document.createElement('div');
        grid.className = 'jellyrate-rated-grid';

        const items = ratedViewItems;
        if (!items || items.length === 0) {
            grid.innerHTML = '<div class="jellyrate-rated-empty">No rated items in this library.</div>';
            container.appendChild(grid);
            return;
        }

        if (ratedViewAggregate) {
            const filtered = [];
            for (const item of items) {
                const ratings = getFilteredRatings(item);
                if (ratings.length === 0) continue;
                const avg = ratings.reduce((s, r) => s + r.Rating, 0) / ratings.length;
                filtered.push({ item, avg, total: ratings.length, ratings });
            }
            filtered.sort((a, b) => b.avg - a.avg);

            if (filtered.length === 0) {
                grid.innerHTML = '<div class="jellyrate-rated-empty">No rated items match the current filters.</div>';
            } else {
                for (const { item, avg, total, ratings } of filtered) {
                    grid.appendChild(buildRatedCard(item, avg, total, ratings));
                }
            }
        } else {
            const userMap = new Map();
            for (const item of items) {
                for (const ur of (item.UserRatings || [])) {
                    if (ratedViewEnabledUsers[ur.UserId] === false) continue;
                    if (!userMap.has(ur.UserId)) {
                        userMap.set(ur.UserId, { username: ur.Username, items: [] });
                    }
                    userMap.get(ur.UserId).items.push({ item, rating: ur.Rating });
                }
            }

            const sortedUsers = [...userMap.entries()].sort((a, b) => a[1].username.localeCompare(b[1].username));

            if (sortedUsers.length === 0) {
                grid.innerHTML = '<div class="jellyrate-rated-empty">No rated items match the current filters.</div>';
            } else {
                for (const [, userData] of sortedUsers) {
                    const header = document.createElement('div');
                    header.className = 'jellyrate-user-section';
                    header.textContent = userData.username;
                    grid.appendChild(header);

                    userData.items.sort((a, b) => b.rating - a.rating);
                    for (const { item, rating } of userData.items) {
                        grid.appendChild(buildRatedCard(item, rating, 1, [{ Username: userData.username, Rating: rating }]));
                    }
                }
            }
        }

        container.appendChild(grid);
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

    async function showRatedView(parentId) {
        removeRatedView();

        const activeTab = document.querySelector('.page:not(.hide) .pageTabContent:not(.hide)');
        if (!activeTab) return;

        // Hide all native siblings (button, filter bar, card grid) within this tab
        Array.from(activeTab.children).forEach(child => {
            if (child.id !== 'jellyrate-ratedView') {
                child.setAttribute('data-jellyrate-hidden', child.style.display || '');
                child.style.display = 'none';
            }
        });

        const view = document.createElement('div');
        view.id = 'jellyrate-ratedView';
        view.innerHTML = '<div class="jellyrate-rated-empty">Loading...</div>';
        activeTab.appendChild(view);

        try {
            const items = await fetchRatedItems(null, parentId);
            ratedViewItems = items || [];
            ratedViewAggregate = false;
            ratedViewEnabledUsers = {};
            view.innerHTML = '';
            renderRatedToolbar(view);
            renderRatedGrid(view);
        } catch (err) {
            view.innerHTML = `<div class="jellyrate-rated-empty">Failed to load: ${err.message}</div>`;
        }
    }

    async function tryInjectRatedButton() {
        if (!isLibraryPage()) return;
        const cfg = await fetchConfig();
        if (!cfg || cfg.DisableUserRatedTab) return;

        const activeTab = document.querySelector('.page:not(.hide) .pageTabContent:not(.hide)');
        if (!activeTab) return;
        if (activeTab.querySelector('.jellyrate-rated-btn')) return;

        // Only show button if there are rated items anywhere
        try {
            const stats = await fetchAllStats();
            if (!stats || Object.keys(stats).length === 0) return;
        } catch { return; }

        const btn = document.createElement('button');
        btn.className = 'jellyrate-rated-btn';
        btn.type = 'button';
        btn.textContent = '\u2B50 User Rated';

        // Insert before .itemsContainer (between filter bar and content grid)
        const itemsContainer = activeTab.querySelector('.itemsContainer');
        if (itemsContainer) {
            itemsContainer.parentElement.insertBefore(btn, itemsContainer);
        } else {
            activeTab.insertBefore(btn, activeTab.firstChild);
        }

        btn.addEventListener('click', () => {
            const parentId = getLibraryParentId();
            history.pushState({ jellyrate: 'rated', parentId }, '');
            showRatedView(parentId);
        });
    }

    // Single polling function — checks every POLL_INTERVAL whether button
    // needs injection and whether rated view should be shown/hidden.
    // Self-healing: if DOM isn't ready, just retries next tick.
    async function checkRatedButton() {
        if (!isLibraryPage()) {
            removeRatedView();
            return;
        }

        const activeTab = document.querySelector('.page:not(.hide) .pageTabContent:not(.hide)');
        if (!activeTab) return;

        // Inject button if missing
        if (!activeTab.querySelector('.jellyrate-rated-btn')) {
            await tryInjectRatedButton();
        }

        // Show or hide rated view based on history state
        const shouldShow = history.state?.jellyrate === 'rated';
        const isShown = !!document.getElementById('jellyrate-ratedView');

        if (shouldShow && !isShown) {
            showRatedView(history.state.parentId);
        } else if (!shouldShow && isShown) {
            removeRatedView();
        }
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

        // "User Rated" button — poll + event-driven checks
        window.addEventListener('hashchange', checkRatedButton);
        window.addEventListener('popstate', checkRatedButton);
        setInterval(checkRatedButton, POLL_INTERVAL);
        checkRatedButton();

        // Any tab button click exits rated view (delegated — works even if tab strip rebuilds)
        document.addEventListener('click', (e) => {
            if (document.getElementById('jellyrate-ratedView') && e.target.closest('.emby-tab-button')) {
                history.replaceState(null, '');
                removeRatedView();
            }
        });
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
