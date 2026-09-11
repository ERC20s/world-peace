// Shared URL and source-detection helpers for tools/*
// Implemented in CommonJS so existing scripts can require() it.

const { URL } = require('url');

// True when the href points at an external source: http://, https:// or //host.
function isExternalHref(href) {
  return /^\s*(?:https?:)?\/\//i.test(String(href));
}

// Check used by the link checker: resolves with a base and treats as external
// only when the original had a protocol or started with // (matches old behaviour).
function isExternalHttp(url) {
  try {
    const u = new URL(url, 'http://example.local');
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      // If the href was relative (no protocol, no leading //), URL resolved with base -> host 'example.local'
      // Treat as external only if original had protocol or started with //
      return /^https?:\/\//i.test(url) || /^\/\//.test(url);
    }
  } catch (err) {
    return false;
  }
  return false;
}

// Recognise placeholder / example hostnames used in templates and examples.
function isPlaceholderUrl(raw) {
  try {
    let candidate = String(raw).trim();
    if (/^\/\//.test(candidate)) candidate = 'https:' + candidate;
    const u = new URL(candidate, 'http://example.local');
    const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return /^(?:example\.org|example\.com|example\.net|example\.local|localhost|d8a\.com)$/i.test(host);
  } catch (err) {
    return false;
  }
}

// Detect likely donation or fundraising URLs by token matches in host, path or query.
function isDonationUrl(raw) {
  try {
    let candidate = String(raw).trim();
    if (/^\/\//.test(candidate)) candidate = 'https:' + candidate;
    const u = new URL(candidate, 'http://example.local');
    const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    const pathAndQuery = (u.pathname || '') + (u.search || '');
    const combined = (host + ' ' + pathAndQuery).toLowerCase();

    const tokens = [
      'donate', 'donations', 'give', 'gofundme', 'patreon', 'fundraise', 'fundraiser',
      'indiegogo', 'kickstarter', 'ko-fi', 'kofi', 'buymeacoffee', 'paypal.me', 'paypal'
    ];

    return tokens.some(t => combined.indexOf(t) !== -1);
  } catch (err) {
    return false;
  }
}

// True for secure URLs: https: and protocol-relative (//host) treated as https.
function isSecureUrl(raw) {
  try {
    let candidate = String(raw).trim();
    if (/^\/\//.test(candidate)) candidate = 'https:' + candidate;
    const u = new URL(candidate, 'http://example.local');
    return u.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

// Normalise a URL: protocol-relative -> https, drop fragments, ensure a pathname.
function normaliseUrl(raw) {
  let candidate = raw;
  if (/^\/\//.test(candidate)) candidate = 'https:' + candidate;
  try {
    const u = new URL(candidate);
    u.hash = '';
    if (!u.pathname) u.pathname = '/';
    return u.toString();
  } catch (err) {
    return candidate;
  }
}

module.exports = {
  isExternalHref,
  isExternalHttp,
  isPlaceholderUrl,
  isDonationUrl,
  isSecureUrl,
  normaliseUrl
};
