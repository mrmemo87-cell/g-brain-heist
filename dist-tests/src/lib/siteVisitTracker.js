// Anonymous page-view tracking for brainsheist.com, shown in the superadmin "Site Visitors" tab.
//
// Only browsers that have never signed in are tracked: as soon as a session appears, this
// browser is remembered as a member and never tracked again. Nothing personal is sent: a
// random visitor id kept in localStorage, the page path (no query string), the referring
// site's host name, UTM tags, device type and language. Country/city are added server-side
// from Vercel's edge headers by /api/site-visit.
const VISITOR_KEY = 'bh_site_visitor_id';
const MEMBER_KEY = 'bh_site_member';
const SESSION_KEY = 'bh_site_session';
const SESSION_IDLE_MS = 30 * 60 * 1000;
let started = false;
let lastPath = null;
const safeGet = (storage, key) => {
    try {
        return storage?.getItem(key) ?? null;
    }
    catch {
        return null;
    }
};
const safeSet = (storage, key, value) => {
    try {
        storage?.setItem(key, value);
    }
    catch { /* storage unavailable */ }
};
const uuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.floor(Math.random() * 16);
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
};
export const looksAutomated = (nav) => {
    if (!nav)
        return true;
    if (nav.webdriver)
        return true;
    return /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|scanner/i.test(nav.userAgent || '');
};
export const deviceOf = (width, userAgent) => {
    if (/ipad|tablet/i.test(userAgent) || (width >= 600 && width < 1024 && /android|mobile/i.test(userAgent)))
        return 'tablet';
    if (/mobi|iphone|android/i.test(userAgent) || width < 600)
        return 'phone';
    return 'desktop';
};
export const externalReferrerHost = (referrer, ownHost) => {
    if (!referrer)
        return null;
    try {
        const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
        const own = ownHost.toLowerCase().replace(/^www\./, '');
        if (!host || host === own || host.endsWith(`.${own}`) || own.endsWith(`.${host}`))
            return null;
        return host;
    }
    catch {
        return null;
    }
};
export const utmFrom = (search) => {
    const params = new URLSearchParams(search);
    const utm = {};
    for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        const value = params.get(name);
        if (value)
            utm[name] = value.slice(0, 120);
    }
    return utm;
};
const sessionId = () => {
    const now = Date.now();
    const stored = safeGet(window.sessionStorage, SESSION_KEY);
    if (stored) {
        const [id, at] = stored.split('|');
        if (id && Number(at) > now - SESSION_IDLE_MS) {
            safeSet(window.sessionStorage, SESSION_KEY, `${id}|${now}`);
            return id;
        }
    }
    const fresh = uuid();
    safeSet(window.sessionStorage, SESSION_KEY, `${fresh}|${now}`);
    return fresh;
};
const send = (payload) => {
    const body = JSON.stringify(payload);
    try {
        void fetch('/api/site-visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
    }
    catch { /* never break the page for analytics */ }
};
const track = async (hasSession) => {
    const path = window.location.pathname || '/';
    if (path === lastPath)
        return;
    if (path.startsWith('/auth/') || path.startsWith('/api/'))
        return;
    if (safeGet(window.localStorage, MEMBER_KEY) === '1')
        return;
    let signedIn = false;
    try {
        signedIn = await hasSession();
    }
    catch {
        signedIn = false;
    }
    if (signedIn) {
        safeSet(window.localStorage, MEMBER_KEY, '1');
        return;
    }
    lastPath = path;
    let visitorId = safeGet(window.localStorage, VISITOR_KEY);
    if (!visitorId) {
        visitorId = uuid();
        safeSet(window.localStorage, VISITOR_KEY, visitorId);
    }
    send({
        visitorId,
        sessionId: sessionId(),
        path,
        referrerHost: externalReferrerHost(document.referrer, window.location.hostname),
        utm: utmFrom(window.location.search),
        device: deviceOf(window.innerWidth, navigator.userAgent),
        locale: navigator.language,
    });
};
export const startSiteVisitTracking = (hasSession) => {
    if (started || typeof window === 'undefined')
        return;
    if (looksAutomated(typeof navigator === 'undefined' ? undefined : navigator))
        return;
    if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname))
        return;
    started = true;
    const schedule = () => { window.setTimeout(() => { void track(hasSession); }, 400); };
    for (const method of ['pushState', 'replaceState']) {
        const original = window.history[method];
        window.history[method] = function patched(...args) {
            const result = original.apply(this, args);
            schedule();
            return result;
        };
    }
    window.addEventListener('popstate', schedule);
    schedule();
};
