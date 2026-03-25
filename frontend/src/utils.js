export const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || '');

export function formatTokens(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

export function getSourceDisplay(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname;
  } catch (_e) {
    return url;
  }
}

export function slugFromUrl(url) {
  try {
    const parsed = new URL(url);
    const raw = parsed.pathname.replace(/\/+$/, '').replace(/^\/+/, '').replace(/\//g, '-') || 'index';
    return raw.replace(/[^a-z0-9\-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'page';
  } catch (_e) {
    const rawName = typeof url === 'string' ? url.split('/').pop() || 'page' : 'page';
    return rawName.replace(/[^a-z0-9\-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'page';
  }
}

export function urlToPageSlug(url) {
  try {
    const parsed = new URL(url);
    let slug = parsed.pathname.replace(/^\//, '').replace(/\/$/, '');
    slug = slug.replace(/\//g, '--');
    slug = slug.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
    return slug || '_root';
  } catch (_e) {
    const rawName = typeof url === 'string' ? url.split('/').pop() || '_root' : '_root';
    return rawName.replace(/[^a-z0-9\-]/gi, '-').toLowerCase() || '_root';
  }
}

export function saveUserPages(hostname, slugs) {
  try {
    localStorage.setItem(`html2md_pages_${hostname}`, JSON.stringify(slugs));
  } catch (_e) { /* localStorage unavailable */ }
}

export function getUserPages(hostname) {
  try {
    const raw = localStorage.getItem(`html2md_pages_${hostname}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function clearUserPages(hostname) {
  try {
    localStorage.removeItem(`html2md_pages_${hostname}`);
  } catch (_e) { /* noop */ }
}

export function getClientId() {
  try {
    let id = localStorage.getItem('html2md_client_id');
    if (!id) {
      id = 'c_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
      localStorage.setItem('html2md_client_id', id);
    }
    return id;
  } catch (_e) {
    return 'anonymous';
  }
}
