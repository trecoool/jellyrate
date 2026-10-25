// Per-user ratings popover: hover with mouse, tap/click toggles.

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
export function attachRatingsTooltip(anchorEl, loadRatings, tapEl = anchorEl) {
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
