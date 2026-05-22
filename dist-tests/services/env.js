const envSource = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env
    : (typeof process !== 'undefined' ? process.env : {});
export const getEnvVar = (key) => {
    return envSource[key];
};
export const getRequiredEnvVar = (key) => {
    const value = getEnvVar(key);
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};
const normalizeSiteUrl = (value) => {
    try {
        const url = new URL(value);
        return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''));
    }
    catch (error) {
        throw new Error(`Invalid URL provided for environment variable: ${value}`);
    }
};
const toAbsoluteUrl = (value) => {
    try {
        const url = new URL(value);
        return url.toString().replace(/\/$/, '');
    }
    catch (error) {
        throw new Error(`Invalid URL provided for environment variable: ${value}`);
    }
};
export const getSiteUrl = () => {
    const explicitSiteUrl = getEnvVar('VITE_SITE_URL') ||
        getEnvVar('VITE_PUBLIC_SITE_URL') ||
        getEnvVar('VITE_SUPABASE_SITE_URL');
    if (explicitSiteUrl) {
        return normalizeSiteUrl(explicitSiteUrl);
    }
    if (typeof window !== 'undefined' && window.location) {
        return window.location.origin;
    }
    return undefined;
};
export const getAuthRedirectUrl = () => {
    const explicitRedirectUrl = getEnvVar('VITE_SUPABASE_AUTH_REDIRECT_URL') ||
        getEnvVar('VITE_AUTH_REDIRECT_URL');
    if (explicitRedirectUrl) {
        return toAbsoluteUrl(explicitRedirectUrl);
    }
    const siteUrl = getSiteUrl();
    if (!siteUrl) {
        return undefined;
    }
    const callbackPath = getEnvVar('VITE_SUPABASE_AUTH_CALLBACK_PATH') || 'auth/callback';
    const normalizedPath = callbackPath.replace(/^\/+/, '');
    const normalizedSiteUrl = siteUrl.replace(/\/$/, '');
    if (!normalizedPath) {
        return normalizedSiteUrl;
    }
    return `${normalizedSiteUrl}/${normalizedPath}`;
};
export { envSource };
