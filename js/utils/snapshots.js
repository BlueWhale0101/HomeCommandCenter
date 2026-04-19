function parseServiceWorkerVersion(scriptUrl = '') {
  if (!scriptUrl) return '';
  try {
    const url = new URL(scriptUrl, window.location.href);
    return url.searchParams.get('v') || '';
  } catch {
    const match = String(scriptUrl).match(/[?&]v=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }
}

function describeSnapshotPublisher(snapshot) {
  const source = String(snapshot?.source || '').trim();
  if (!source) return '';
  if (source.startsWith('calendar-publisher:')) return source.slice('calendar-publisher:'.length) || 'Unknown device';
  if (source === 'headless-google-calendar') return 'Legacy calendar publisher';
  if (source === 'live-weather') return 'This device';
  return source.replace(/[-_]+/g, ' ');
}

function snapshotStatusLevel(snapshot) {
  if (!snapshot) return 'warning';
  if (snapshot.valid_until && new Date(snapshot.valid_until) < getNowDate()) return 'warning';
  const ageMinutes = snapshot.created_at ? Math.max(0, Math.round((getNowMs() - new Date(snapshot.created_at).getTime()) / 60000)) : 0;
  if (ageMinutes >= 30) return 'warning';
  if (ageMinutes >= 10) return 'notice';
  return 'info';
}

function snapshotFreshnessClass(snapshot) {
  return getSnapshotFreshnessState(snapshot).pillClass;
}

function snapshotFreshnessPill(snapshot, fallback = 'Live') {
  return getSnapshotFreshnessState(snapshot, fallback).pill;
}

function getFreshnessDescriptorFromAgeMs(ageMs, thresholds = {}) {
  const freshMs = Number(thresholds.freshMs || 0);
  const agingMs = Number(thresholds.agingMs || freshMs || 0);
  if (!Number.isFinite(ageMs) || ageMs < 0) return { pill: 'Unknown', pillClass: 'warning', level: 'warning' };
  if (ageMs <= freshMs) return { pill: 'Fresh', pillClass: '', level: 'info' };
  if (ageMs <= agingMs) return { pill: 'Aging', pillClass: 'notice', level: 'notice' };
  return { pill: 'Stale', pillClass: 'warning', level: 'warning' };
}

window.HCC.utils = Object.assign(window.HCC.utils || {}, {
  parseServiceWorkerVersion,
  describeSnapshotPublisher,
  snapshotStatusLevel,
  snapshotFreshnessClass,
  snapshotFreshnessPill,
  getFreshnessDescriptorFromAgeMs,
});
