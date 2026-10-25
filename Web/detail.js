// Rating widget on item detail pages.
import { fetchConfig, fetchStats, submitRating, deleteRating, invalidateStatsCache, fetchDetailedRatingsCached } from './core.js';
import { attachRatingsTooltip } from './popover.js';
import { processVisibleCards } from './cards.js';

const DETAIL_RETRY_MAX = 15;
const DETAIL_RETRY_INTERVAL = 400;

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

export async function handleDetailPage(itemId, attempt = 0) {
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
