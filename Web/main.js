// Entry module: SPA navigation, init, boot.
import { ID_REGEX, getApiClient } from './core.js';
import { injectStyles } from './styles.js';
import { handleDetailPage } from './detail.js';
import { setupCardObserver, scheduleCardProcessing } from './cards.js';
import { watchRatedUi } from './rated-entry.js';

const POLL_INTERVAL = 500;
const INIT_TIMEOUT = 2000;
let lastUrl = '';
let currentItemId = null;

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
