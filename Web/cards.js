// Average-rating badges on library cards.
import { ID_REGEX, fetchAllStats, fetchDetailedRatingsCached } from './core.js';
import { attachRatingsTooltip } from './popover.js';

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

export async function processVisibleCards() {
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

export function scheduleCardProcessing() {
    if (cardProcessTimer) clearTimeout(cardProcessTimer);
    cardProcessTimer = setTimeout(processVisibleCards, 300);
}

export function setupCardObserver() {
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
