function clampHour(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(23, Math.round(num)));
}

function getNowDate() {
  return appState?.testTimeOverride ? new Date(appState.testTimeOverride) : new Date();
}

function getNowMs() {
  return getNowDate().getTime();
}

function loadTestTimeOverride() {
  try {
    const value = localStorage.getItem(TEST_TIME_STORAGE);
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  } catch {
    return null;
  }
}

function saveTestTimeOverride(value) {
  try {
    if (value) localStorage.setItem(TEST_TIME_STORAGE, value);
    else localStorage.removeItem(TEST_TIME_STORAGE);
  } catch {}
}

function currentDateInputValue() {
  const d = getNowDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeTime(value) {
  if (!value) return 'just now';
  const deltaMs = getNowMs() - new Date(value).getTime();
  const mins = Math.round(deltaMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isTomorrow(date) {
  const tomorrow = getNowDate();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(date, tomorrow);
}

window.HCC.utils = Object.assign(window.HCC.utils || {}, {
  clampHour,
  getNowDate,
  getNowMs,
  loadTestTimeOverride,
  saveTestTimeOverride,
  currentDateInputValue,
  relativeTime,
  startOfDay,
  isSameDay,
  isTomorrow,
});
