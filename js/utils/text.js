function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanLocationName(name) {
  return String(name || '').split(',')[0].trim();
}

function normalizeTokenText(value) {
  return String(value || '').toLowerCase();
}

function includesAnyToken(text, patterns) {
  const haystack = normalizeTokenText(text);
  return patterns.some((pattern) => haystack.includes(pattern));
}

function tokenizeMeaningfulWords(value) {
  return normalizeTokenText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !['with', 'from', 'that', 'this', 'have', 'will', 'your', 'into', 'need', 'make', 'tomorrow', 'today'].includes(token));
}

function normalizeOwnerKey(owner) {
  const value = String(owner || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'wes') return 'wes';
  if (value === 'skye') return 'skye';
  return 'shared';
}

function weatherCodeLabel(code) {
  const groups = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
  };
  return groups[Number(code)] || 'Weather';
}

window.HCC.utils = Object.assign(window.HCC.utils || {}, {
  capitalize,
  escapeHtml,
  cleanLocationName,
  normalizeTokenText,
  includesAnyToken,
  tokenizeMeaningfulWords,
  normalizeOwnerKey,
  weatherCodeLabel,
});
