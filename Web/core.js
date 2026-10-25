// Shared constants, API helpers and rating caches.

export const ID_REGEX = /id=([a-f0-9]{32}|[a-f0-9-]{36})/i;
let config = null;
let allStatsCache = null;
let allStatsCacheTime = 0;
const STATS_CACHE_TTL = 60000; // 1 minute
const detailedRatingsCache = new Map(); // itemId -> [{ Rating, Username }]

// ── API helpers ─────────────────────────────────────────

export function getApiClient() { return window.ApiClient || null; }

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

export async function apiFetch(path, options = {}) {
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

export async function fetchConfig() {
    if (config) return config;
    config = await apiFetch('/Ratings/Config');
    return config;
}

export async function fetchStats(itemId) { return apiFetch(`/Ratings/Items/${itemId}/Stats`); }
export async function submitRating(itemId, rating) { return apiFetch(`/Ratings/Items/${itemId}/Rating?rating=${rating}`, { method: 'POST' }); }
export async function deleteRating(itemId) { return apiFetch(`/Ratings/Items/${itemId}/Rating`, { method: 'DELETE' }); }
async function fetchDetailedRatings(itemId) { return apiFetch(`/Ratings/Items/${itemId}/DetailedRatings`); }

export async function fetchAllStats() {
    const now = Date.now();
    if (allStatsCache && (now - allStatsCacheTime) < STATS_CACHE_TTL) return allStatsCache;
    allStatsCache = await apiFetch('/Ratings/AllStats');
    allStatsCacheTime = now;
    return allStatsCache;
}

// Invalidate bulk cache after a rating change so cards refresh
export function invalidateStatsCache() {
    allStatsCache = null;
    allStatsCacheTime = 0;
    detailedRatingsCache.clear();
}

export async function fetchDetailedRatingsCached(itemId) {
    if (!detailedRatingsCache.has(itemId)) detailedRatingsCache.set(itemId, await fetchDetailedRatings(itemId));
    return detailedRatingsCache.get(itemId);
}

