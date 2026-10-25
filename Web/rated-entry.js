// User Rated button in the library toolbar row; shows the view iff history state says so.
import { fetchConfig, fetchAllStats } from './core.js';
import { showRatedView, removeRatedView } from './rated-view.js';

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
export function watchRatedUi() {
    new MutationObserver(scheduleRatedSync).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', scheduleRatedSync);
    window.addEventListener('resize', scheduleRatedSync);
    scheduleRatedSync();
}
