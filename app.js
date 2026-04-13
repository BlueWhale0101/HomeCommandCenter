const APP_VERSION = '2.8.0';
window.__hccBootState = window.__hccBootState || { started: false, finished: false, phase: 'script-loaded', version: APP_VERSION, errors: [] };
window.__HCC_FORCE_BOOT = () => startBootstrap();
const BOOT_TIMEOUT_MS = 8000;

const DEFAULT_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
  deviceName: 'New device',
  mode: 'tv',
  location: 'kitchen',
  taskTable: 'tasks',
  taskDateField: 'due_text',
  taskOwnerField: 'owner',
  taskTitleField: 'task',
  taskCompletedField: '',
  taskCompletedValue: 'true',
  useStringCompleted: false,
  weatherSnapshotType: 'weather_today',
  calendarTodaySnapshotType: 'calendar_today',
  calendarTomorrowSnapshotType: 'calendar_tomorrow',
  uiRefreshSeconds: 600,
  googleClientId: '',
  weatherLocationQuery: '',
  weatherLocationName: '',
  weatherLatitude: '',
  weatherLongitude: '',
  weatherTimezone: '',
  signalRulesDraft: null,
  keepScreenAwake: false,
};

const DEVICE_KEY_STORAGE = 'household-command-center-device-key';
const CONFIG_STORAGE = 'household-command-center-config';
const SETTINGS_JSON_AUTOLOAD_DONE = 'household-command-center-settings-json-autoload-done';
const TEST_TIME_STORAGE = 'household-command-center-test-time-override';
const SIGNAL_SNOOZE_STORAGE = 'household-command-center-signal-snoozes';
const DERIVED_SIGNAL_MEMORY_STORAGE = 'household-command-center-derived-signal-memory';
const CALENDAR_ACCOUNTS_STORAGE = 'household-command-center-google-calendar-accounts';

const GOOGLE_AUTH_REDIRECT_STATE_STORAGE = 'household-command-center-google-auth-state';

function getGoogleRedirectUri() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function createGoogleAuthState() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function saveGoogleAuthRedirectState(state) {
  try { localStorage.setItem(GOOGLE_AUTH_REDIRECT_STATE_STORAGE, state); } catch {}
}

function consumeGoogleAuthRedirectState() {
  try {
    const state = localStorage.getItem(GOOGLE_AUTH_REDIRECT_STATE_STORAGE) || '';
    localStorage.removeItem(GOOGLE_AUTH_REDIRECT_STATE_STORAGE);
    return state;
  } catch {
    return '';
  }
}
const SHARED_CONFIG_TABLE = 'household_config';
const SHARED_CONFIG_KEYS = {
  googleClientId: 'google_client_id',
  weather: 'weather_config',
  calendarAccounts: 'google_calendar_accounts',
  signalRules: 'signal_rules',
};
const DEVICE_PROFILE_CONFIG_KEYS = ['deviceName', 'mode', 'location', 'keepScreenAwake'];
const LOCAL_ONLY_CONFIG_KEYS = [
  'supabaseUrl',
  'supabaseKey',
  'taskTable',
  'taskDateField',
  'taskOwnerField',
  'taskTitleField',
  'taskCompletedField',
  'taskCompletedValue',
  'useStringCompleted',
  'weatherSnapshotType',
  'calendarTodaySnapshotType',
  'calendarTomorrowSnapshotType',
  'uiRefreshSeconds',
];
const TASK_FIELD_CANDIDATES = {
  taskTitleField: ['task', 'title', 'name', 'label'],
  taskOwnerField: ['owner', 'assigned_to', 'assignee', 'person'],
  taskDateField: ['due_text', 'due_date', 'due', 'due_at', 'scheduled_for', 'date'],
  taskCompletedField: ['completed', 'done', 'is_completed', 'is_done', 'complete'],
};
const QUICK_LOGS = [
  { label: 'Kitchen cleaned', eventType: 'kitchen_cleaned', location: 'kitchen' },
  { label: 'Dishes done', eventType: 'dishes_done', location: 'kitchen' },
  { label: 'Bins out', eventType: 'bins_out', location: 'outside' },
  { label: 'Laundry done', eventType: 'laundry_done', location: 'laundry' },
];
const LOAD_STATUS_ORDER = ['washing', 'drying', 'ready', 'done'];

const DAY_OPTIONS = [
  ['0', 'Sunday'],
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
];
const DEFAULT_SIGNAL_RULES = {
  bins: {
    enabled: true,
    dayOfWeek: 3,
    startHour: 12,
    escalateHour: 17,
    location: 'outside',
  },
  laundry: {
    enabled: true,
  },
  tomorrowEvent: {
    enabled: true,
    startHour: 17,
    minEvents: 1,
  },
  custom: [],
};
const CUSTOM_SIGNAL_SCHEDULE_OPTIONS = [
  ['weekly', 'Weekly on a day'],
  ['daily', 'Daily'],
];
const CUSTOM_SIGNAL_CLEAR_OPTIONS = [
  ['schedule_window', 'Hide outside the schedule window'],
  ['log_event_today', 'Clear when a matching household log happens today'],
];

let autoRefreshTimer = null;
let slowStateBackstopTimer = null;
let calendarPublishTimer = null;
let housekeepingTimer = null;
let pendingTaskCompletions = new Set();
let pendingSignalActions = new Set();
let armedTaskCompletions = new Map();
const TASK_COMPLETE_ARM_WINDOW_MS = 3200;

const HEALTHY_AUTO_REFRESH_SECONDS = 600;
const DEGRADED_AUTO_REFRESH_SECONDS = 90;
const SLOW_STATE_BACKSTOP_SECONDS = 1800;
const CALENDAR_PUBLISH_INTERVAL_SECONDS = 900;
const HOUSEKEEPING_INTERVAL_SECONDS = 43200;
const SNAPSHOT_RETENTION_DAYS = 7;
const LOG_RETENTION_DAYS = 30;
const RESOLVED_SIGNAL_RETENTION_DAYS = 30;
const LOAD_RETENTION_DAYS = 30;
const RECENT_DONE_WINDOW_DAYS = 7;
const HOUSEKEEPING_LAST_RUN_STORAGE = 'household-command-center-housekeeping-last-run';
const HOUSEKEEPING_REPORT_STORAGE = 'household-command-center-housekeeping-report';

const DEFAULT_CONNECTION_STATUS = {
  supabase: { level: 'unknown', text: 'Not tested' },
  tasks: { level: 'unknown', text: 'Not tested' },
  deviceProfile: { level: 'unknown', text: 'Not tested' },
  realtime: { level: 'unknown', text: 'Not tested' },
  serviceWorker: { level: 'unknown', text: 'Not tested' },
};

const INITIAL_CONFIG = loadConfig();

let appState = {
  config: INITIAL_CONFIG,
  supabase: null,
  deviceKey: getOrCreateDeviceKey(),
  deviceProfile: null,
  tasks: [],
  logs: [],
  signals: [],
  loads: [],
  snapshots: {},
  subscriptions: [],
  connectionStatus: typeof structuredClone === 'function' ? structuredClone(DEFAULT_CONNECTION_STATUS) : JSON.parse(JSON.stringify(DEFAULT_CONNECTION_STATUS)),
  testTimeOverride: loadTestTimeOverride(),
  calendarAccounts: loadCalendarAccounts(),
  mobileTab: 'status',
  sharedConfig: {},
  wakeLockSentinel: null,
  wakeLockStatus: {
    supported: typeof navigator !== 'undefined' && !!(navigator.wakeLock && navigator.wakeLock.request),
    enabled: false,
    active: false,
    error: '',
    note: '',
    needsInteraction: false,
    lastAttemptAt: '',
    lastReason: '',
    retryCount: 0,
    releasedAt: '',
  },
  sharedConfigMeta: {},
  signalRulesDraft: normalizeSignalRules(INITIAL_CONFIG.signalRulesDraft),
  calendarDiagnostics: { selectedSources: 0, fetchedEvents: 0, mergedToday: 0, mergedTomorrow: 0, expiredAccounts: 0, lastError: '', lastSuccessAt: '' },
  calendarPublisherDiagnostics: {
    canPublish: false,
    lastAttemptAt: '',
    lastAttemptReason: '',
    lastPublishAt: '',
    lastPublishStatus: 'idle',
    lastPublishSource: '',
    lastSkipReason: '',
    lastPublishError: '',
    lastItemsToday: 0,
    lastItemsTomorrow: 0,
    lastSelectedSources: 0,
  },
  housekeepingDiagnostics: loadHousekeepingDiagnostics(),
  refreshCoordinator: {
    inFlight: null,
    pendingReason: '',
    lastReason: '',
    lastCompletedAt: '',
  },
  realtimeDiagnostics: {
    subscribedAt: '',
    activeChannels: 0,
    channelStates: {},
    lastEventAt: '',
    lastEventTable: '',
    lastEventType: '',
    lastStatus: '',
  },
  serviceWorkerDiagnostics: {
    supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    registrationState: 'unregistered',
    scriptUrl: '',
    scriptVersion: '',
    controllerScriptUrl: '',
    controllerVersion: '',
    cacheVersion: '',
    waitingVersion: '',
    installingVersion: '',
    updateReady: false,
    mismatch: false,
    mismatchReason: '',
    lastCheckAt: '',
    lastMessageAt: '',
  },
  ioDiagnostics: {
    sessionStartedAt: new Date().toISOString(),
    refreshes: { full: 0, targeted: 0, queued: 0, lastType: '', lastReason: '', lastAt: '', lastDurationMs: 0 },
    reads: {},
    writes: {},
    timers: {
      autoRefreshSeconds: 0,
      autoRefreshMode: '',
      autoRefreshLastFiredAt: '',
      slowStateBackstopSeconds: 0,
      slowStateBackstopLastFiredAt: '',
      calendarPublishSeconds: 0,
      calendarPublishLastFiredAt: '',
      housekeepingSeconds: 0,
      housekeepingLastFiredAt: '',
    },
  },
};

const screenEl = document.getElementById('screen');

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

function updateServiceWorkerDiagnostics(patch = {}) {
  appState.serviceWorkerDiagnostics = { ...(appState.serviceWorkerDiagnostics || {}), ...patch };
}

function evaluateServiceWorkerDiagnostics() {
  const diag = appState.serviceWorkerDiagnostics || {};
  const mismatchReasons = [];
  if (!diag.supported) return { level: 'unknown', text: 'Unavailable', mismatch: false, mismatchReason: '' };
  if (diag.controllerVersion && diag.controllerVersion !== APP_VERSION) mismatchReasons.push(`controller ${diag.controllerVersion}`);
  if (diag.cacheVersion && diag.cacheVersion !== APP_VERSION) mismatchReasons.push(`cache ${diag.cacheVersion}`);
  if (diag.updateReady && diag.waitingVersion && diag.waitingVersion !== APP_VERSION) mismatchReasons.push(`waiting ${diag.waitingVersion}`);
  const mismatchReason = mismatchReasons.length ? `Version mismatch · ${mismatchReasons.join(' · ')}` : '';
  if (mismatchReason || diag.mismatchReason) {
    updateServiceWorkerDiagnostics({ mismatch: true, mismatchReason: mismatchReason || diag.mismatchReason, lastCheckAt: new Date().toISOString() });
    return { level: 'warn', text: mismatchReason || diag.mismatchReason || 'Version mismatch', mismatch: true, mismatchReason: mismatchReason || diag.mismatchReason || '' };
  }
  if (diag.updateReady) {
    const waiting = diag.waitingVersion ? `v${diag.waitingVersion.replace(/^v/, '')}` : 'new worker';
    updateServiceWorkerDiagnostics({ mismatch: false, mismatchReason: '', lastCheckAt: new Date().toISOString() });
    return { level: 'warn', text: `Update ready · ${waiting}`, mismatch: false, mismatchReason: '' };
  }
  if (!diag.controllerScriptUrl) {
    updateServiceWorkerDiagnostics({ mismatch: false, mismatchReason: '', lastCheckAt: new Date().toISOString() });
    return { level: 'unknown', text: diag.registrationState === 'registering' ? 'Registering…' : 'No controller yet', mismatch: false, mismatchReason: '' };
  }
  const activeLabel = diag.cacheVersion ? `cache ${diag.cacheVersion}` : `controller ${diag.controllerVersion || APP_VERSION}`;
  updateServiceWorkerDiagnostics({ mismatch: false, mismatchReason: '', lastCheckAt: new Date().toISOString() });
  return { level: 'ok', text: `Current · ${activeLabel}`, mismatch: false, mismatchReason: '' };
}

function syncServiceWorkerConnectionStatus() {
  const descriptor = evaluateServiceWorkerDiagnostics();
  setConnectionStatus('serviceWorker', descriptor.level, descriptor.text);
  return descriptor;
}

function requestServiceWorkerVersionReport() {
  if (!(typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller)) return;
  try { navigator.serviceWorker.controller.postMessage({ type: 'REPORT_VERSION', appVersion: APP_VERSION }); } catch {}
}

async function refreshServiceWorkerDiagnostics(registration = null) {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  if (!supported) {
    updateServiceWorkerDiagnostics({ supported: false, registrationState: 'unsupported', lastCheckAt: new Date().toISOString() });
    syncServiceWorkerConnectionStatus();
    return appState.serviceWorkerDiagnostics;
  }
  let reg = registration;
  if (!reg) {
    try { reg = await navigator.serviceWorker.getRegistration(); } catch {}
  }
  const controllerScriptUrl = navigator.serviceWorker.controller?.scriptURL || '';
  updateServiceWorkerDiagnostics({
    supported: true,
    registrationState: reg ? 'registered' : 'unregistered',
    scriptUrl: reg?.active?.scriptURL || reg?.waiting?.scriptURL || reg?.installing?.scriptURL || '',
    scriptVersion: parseServiceWorkerVersion(reg?.active?.scriptURL || reg?.waiting?.scriptURL || reg?.installing?.scriptURL || ''),
    controllerScriptUrl,
    controllerVersion: parseServiceWorkerVersion(controllerScriptUrl),
    waitingVersion: parseServiceWorkerVersion(reg?.waiting?.scriptURL || ''),
    installingVersion: parseServiceWorkerVersion(reg?.installing?.scriptURL || ''),
    updateReady: !!reg?.waiting,
    lastCheckAt: new Date().toISOString(),
  });
  syncServiceWorkerConnectionStatus();
  requestServiceWorkerVersionReport();
  return appState.serviceWorkerDiagnostics;
}

function attachServiceWorkerListeners(registration) {
  if (!(typeof navigator !== 'undefined' && navigator.serviceWorker)) return;
  if (!navigator.serviceWorker.__hccVersionListener) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'SW_VERSION_REPORT') {
        updateServiceWorkerDiagnostics({
          cacheVersion: String(data.cacheVersion || ''),
          scriptUrl: String(data.scriptURL || appState.serviceWorkerDiagnostics?.scriptUrl || ''),
          scriptVersion: parseServiceWorkerVersion(String(data.scriptURL || appState.serviceWorkerDiagnostics?.scriptUrl || '')),
          controllerScriptUrl: navigator.serviceWorker.controller?.scriptURL || appState.serviceWorkerDiagnostics?.controllerScriptUrl || '',
          controllerVersion: parseServiceWorkerVersion(navigator.serviceWorker.controller?.scriptURL || appState.serviceWorkerDiagnostics?.controllerScriptUrl || ''),
          lastMessageAt: new Date().toISOString(),
        });
        syncServiceWorkerConnectionStatus();
        renderApp();
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.setTimeout(() => { refreshServiceWorkerDiagnostics().then(() => renderApp()).catch(() => {}); }, 100);
    });
    navigator.serviceWorker.__hccVersionListener = true;
  }
  if (registration && !registration.__hccUpdateListener) {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      refreshServiceWorkerDiagnostics(registration).then(() => renderApp()).catch(() => {});
      if (worker) {
        worker.addEventListener('statechange', () => {
          refreshServiceWorkerDiagnostics(registration).then(() => renderApp()).catch(() => {});
        });
      }
    });
    registration.__hccUpdateListener = true;
  }
}
const statusLine = document.getElementById('status-line');
const settingsButton = document.getElementById('settings-button');
const refreshButton = document.getElementById('refresh-button');
const trustIndicator = document.getElementById('trust-indicator');
const settingsDialog = document.getElementById('settings-dialog');
const saveSettingsButton = document.getElementById('save-settings');
const versionTag = document.getElementById('version-tag');
const devConsoleEl = document.getElementById('dev-console');
const devConsoleLogEl = document.getElementById('dev-console-log');
const devConsoleMetaEl = document.getElementById('dev-console-meta');
const closeConsoleButton = document.getElementById('close-console-button');
const clearConsoleButton = document.getElementById('clear-console-button');
const copyDiagnosticsButton = document.getElementById('copy-diagnostics-button');
const testTimeInput = document.getElementById('test-time-input');
const setTestTimeButton = document.getElementById('set-test-time-button');
const clearTestTimeButton = document.getElementById('clear-test-time-button');
const testConnectionButton = document.getElementById('test-connection-button');
const connectionStatusGrid = document.getElementById('connection-status-grid');
const googleClientIdInput = document.getElementById('google-client-id');
const weatherLocationInput = document.getElementById('weather-location-input');
const connectGoogleAccountButton = document.getElementById('connect-google-account-button');
const googleCalendarAccountsEl = document.getElementById('google-calendar-accounts');

let bootstrapPromise = null;


function getIoBucket(kind = 'reads') {
  const io = appState.ioDiagnostics || (appState.ioDiagnostics = {
    sessionStartedAt: new Date().toISOString(),
    refreshes: { full: 0, targeted: 0, queued: 0, lastType: '', lastReason: '', lastAt: '', lastDurationMs: 0 },
    reads: {},
    writes: {},
    timers: {},
  });
  if (!io[kind]) io[kind] = {};
  return io[kind];
}

function ensureIoEntry(kind, name) {
  const bucket = getIoBucket(kind);
  bucket[name] = bucket[name] || {
    attempts: 0,
    successes: 0,
    failures: 0,
    lastStartedAt: '',
    lastFinishedAt: '',
    lastDurationMs: 0,
    lastRows: null,
    lastReason: '',
    lastError: '',
  };
  return bucket[name];
}

function startIoOperation(kind, name, reason = '') {
  const entry = ensureIoEntry(kind, name);
  entry.attempts += 1;
  entry.lastStartedAt = new Date().toISOString();
  entry.lastReason = reason || entry.lastReason || '';
  entry.lastError = '';
  return Date.now();
}

function finishIoOperation(kind, name, startedAt, details = {}) {
  const entry = ensureIoEntry(kind, name);
  entry.lastFinishedAt = new Date().toISOString();
  entry.lastDurationMs = Math.max(0, Date.now() - (startedAt || Date.now()));
  if (Object.prototype.hasOwnProperty.call(details, 'rows')) entry.lastRows = details.rows;
  if (details.reason) entry.lastReason = details.reason;
  if (details.ok === false) {
    entry.failures += 1;
    entry.lastError = details.error || '';
  } else {
    entry.successes += 1;
    entry.lastError = '';
  }
}

function noteRefreshIo(type, reason, durationMs = 0) {
  const refreshes = appState.ioDiagnostics.refreshes || (appState.ioDiagnostics.refreshes = { full: 0, targeted: 0, queued: 0, lastType: '', lastReason: '', lastAt: '', lastDurationMs: 0 });
  if (type === 'queued') refreshes.queued += 1;
  else if (type === 'targeted') refreshes.targeted += 1;
  else refreshes.full += 1;
  refreshes.lastType = type;
  refreshes.lastReason = reason || '';
  refreshes.lastAt = new Date().toISOString();
  refreshes.lastDurationMs = Math.max(0, Math.round(durationMs || 0));
}

function updateIoTimerDiagnostics(patch = {}) {
  const io = appState.ioDiagnostics || (appState.ioDiagnostics = {});
  io.timers = { ...(io.timers || {}), ...patch };
}

function formatIoAgo(value) {
  if (!value) return 'never';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

function buildIoSummaryRows() {
  const io = appState.ioDiagnostics || {};
  const refreshes = io.refreshes || {};
  const timers = io.timers || {};
  const readEntries = Object.entries(io.reads || {});
  const writeEntries = Object.entries(io.writes || {});
  const totalReadAttempts = readEntries.reduce((sum, [, entry]) => sum + Number(entry.attempts || 0), 0);
  const totalWriteAttempts = writeEntries.reduce((sum, [, entry]) => sum + Number(entry.attempts || 0), 0);
  const rows = [];
  rows.push(`IO session ${formatIoAgo(io.sessionStartedAt)} · full ${refreshes.full || 0} · targeted ${refreshes.targeted || 0} · queued ${refreshes.queued || 0}`);
  rows.push(`Reads ${totalReadAttempts} · writes ${totalWriteAttempts} · poll ${timers.autoRefreshSeconds || 0}s ${timers.autoRefreshMode || 'unknown'} · realtime ${isRealtimeHealthy() ? 'healthy' : 'degraded'}`);
  const interesting = [
    ['tasks', (io.reads || {}).tasks],
    ['signals', (io.reads || {}).signals],
    ['loads', (io.reads || {}).loads],
    ['snapshots', (io.reads || {}).snapshots],
    ['logs', (io.reads || {}).logs],
    ['household config', (io.reads || {}).householdConfig],
    ['device profile', (io.reads || {}).deviceProfile],
    ['snapshot publish', (io.writes || {}).snapshotPublish],
    ['shared config upsert', (io.writes || {}).sharedConfigUpsert],
    ['housekeeping', (io.writes || {}).housekeeping],
  ].filter(([, entry]) => entry && entry.attempts);
  for (const [label, entry] of interesting.slice(0, 10)) {
    const parts = [`${label}: ${entry.attempts}x`, `${entry.successes || 0} ok`];
    if (entry.failures) parts.push(`${entry.failures} fail`);
    if (entry.lastRows !== null && entry.lastRows !== undefined) parts.push(`rows ${entry.lastRows}`);
    if (entry.lastDurationMs) parts.push(`${entry.lastDurationMs}ms`);
    if (entry.lastFinishedAt) parts.push(formatIoAgo(entry.lastFinishedAt));
    rows.push(parts.join(' · '));
  }
  return rows;
}


function clampHour(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(23, Math.round(num)));
}

function normalizeSignalRules(input) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    bins: {
      enabled: raw?.bins?.enabled !== undefined ? !!raw.bins.enabled : DEFAULT_SIGNAL_RULES.bins.enabled,
      dayOfWeek: Number.isFinite(Number(raw?.bins?.dayOfWeek)) ? Math.max(0, Math.min(6, Number(raw.bins.dayOfWeek))) : DEFAULT_SIGNAL_RULES.bins.dayOfWeek,
      startHour: clampHour(raw?.bins?.startHour, DEFAULT_SIGNAL_RULES.bins.startHour),
      escalateHour: clampHour(raw?.bins?.escalateHour, DEFAULT_SIGNAL_RULES.bins.escalateHour),
      location: String(raw?.bins?.location || DEFAULT_SIGNAL_RULES.bins.location || 'outside').trim() || 'outside',
    },
    laundry: {
      enabled: raw?.laundry?.enabled !== undefined ? !!raw.laundry.enabled : DEFAULT_SIGNAL_RULES.laundry.enabled,
    },
    tomorrowEvent: {
      enabled: raw?.tomorrowEvent?.enabled !== undefined ? !!raw.tomorrowEvent.enabled : DEFAULT_SIGNAL_RULES.tomorrowEvent.enabled,
      startHour: clampHour(raw?.tomorrowEvent?.startHour, DEFAULT_SIGNAL_RULES.tomorrowEvent.startHour),
      minEvents: Math.max(1, Number(raw?.tomorrowEvent?.minEvents) || DEFAULT_SIGNAL_RULES.tomorrowEvent.minEvents),
    },
    custom: Array.isArray(raw?.custom) ? raw.custom.map(normalizeCustomSignalRule).filter((rule) => rule.name) : [],
  };
}

function getEffectiveSignalRules() {
  const shared = appState?.sharedConfig?.[SHARED_CONFIG_KEYS.signalRules];
  if (shared && typeof shared === 'object') return normalizeSignalRules(shared);
  if (appState?.signalRulesDraft) return normalizeSignalRules(appState.signalRulesDraft);
  return normalizeSignalRules(DEFAULT_SIGNAL_RULES);
}

function persistSignalRulesDraft() {
  appState.config.signalRulesDraft = normalizeSignalRules(appState.signalRulesDraft);
  persistLocalConfig();
}

function setSignalRulesDraft(nextRules) {
  appState.signalRulesDraft = normalizeSignalRules(nextRules);
  persistSignalRulesDraft();
}

function formatHourLabel(hour) {
  const normalized = clampHour(hour, 0);
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const display = normalized % 12 || 12;
  return `${display}:00 ${suffix}`;
}

function createRuleId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `rule-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function normalizeCustomSignalRule(input = {}) {
  const scheduleType = String(input.scheduleType || 'weekly');
  const clearMode = String(input.clearMode || 'schedule_window');
  const startHour = clampHour(input.startHour, 17);
  const escalateToWarning = !!input.escalateToWarning;
  const rawEndHour = input.endHour === '' || input.endHour === null || input.endHour === undefined ? null : Number(input.endHour);
  const endHour = Number.isFinite(rawEndHour) ? Math.max(0, Math.min(23, rawEndHour)) : null;
  const escalateHour = clampHour(input.escalateHour, Math.max(startHour, 20));
  return {
    id: String(input.id || createRuleId()),
    enabled: input.enabled !== undefined ? !!input.enabled : true,
    name: String(input.name || '').trim(),
    scheduleType: scheduleType === 'daily' ? 'daily' : 'weekly',
    dayOfWeek: Number.isFinite(Number(input.dayOfWeek)) ? Math.max(0, Math.min(6, Number(input.dayOfWeek))) : 3,
    startHour,
    endHour,
    clearMode: clearMode === 'log_event_today' ? 'log_event_today' : 'schedule_window',
    ackEventType: String(input.ackEventType || '').trim(),
    escalateToWarning,
    escalateHour: Math.max(startHour, escalateHour),
    location: String(input.location || '').trim(),
  };
}

function summarizeCustomSignalRule(rule) {
  const normalized = normalizeCustomSignalRule(rule);
  const timeWindowLabel = normalized.endHour !== null
    ? `${formatHourLabel(normalized.startHour)}–${formatHourLabel(normalized.endHour)}`
    : `from ${formatHourLabel(normalized.startHour)}`;
  const scheduleLabel = normalized.scheduleType === 'daily'
    ? `Daily ${timeWindowLabel}`
    : `${DAY_OPTIONS.find(([value]) => Number(value) === normalized.dayOfWeek)?.[1] || 'Weekly'} ${timeWindowLabel}`;
  const clearLabel = normalized.clearMode === 'log_event_today'
    ? `clears on log${normalized.ackEventType ? `: ${normalized.ackEventType}` : ''}`
    : 'hides outside schedule';
  const warnLabel = normalized.escalateToWarning ? `warns at ${formatHourLabel(normalized.escalateHour)}` : 'no warning escalation';
  return `${scheduleLabel} · ${clearLabel} · ${warnLabel}`;
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

function initApp() {
  try {
    setStatus('Initializing app shell…');
    safeInitStep('Version UI', setupVersionUi);
    safeInitStep('Version badge gesture', setupVersionBadgeLongPress);
    safeInitStep('Developer console', setupDevConsole);
    safeInitStep('Settings UI', setupSettingsUi);
    safeInitStep('Buttons', setupButtons);
    safeInitStep('Wake lock hooks', setupWakeLockHooks);
    safeInitStep('Service worker', () => { registerServiceWorker(); });
startBootstrap();
  } catch (error) {
    handleFatalStartupError(error);
  }
}

function safeInitStep(label, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`Init step failed: ${label}`, error);
    setStatus(`Startup warning: ${label}`);
  }
}

function startBootstrap() {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = Promise.resolve().then(() => bootstrap()).catch(handleFatalStartupError);
  return bootstrapPromise;
}

async function bootstrap() {
  window.__hccBootState.started = true;
  window.__hccBootState.phase = 'bootstrap-started';
  pushDevLog('info', 'Bootstrap started.');
  window.__hccBootState.phase = 'loading-hosted-settings';
  setStatus('Checking hosted settings…');
  await loadHostedSettingsOnce();
  fillSettingsForm();
  window.__hccBootState.phase = 'connecting-supabase';
  setStatus('Connecting to Supabase…');
  await ensureSupabase();
  await handleGoogleCalendarAuthRedirect();
  
window.appState = appState;
window.updateCalendarAuthBanner = updateCalendarAuthBanner;
window.summarizeCalendarConnectionState = summarizeCalendarConnectionState;

resetAutoRefreshTimer();
resetSlowStateBackstopTimer();
resetCalendarPublishTimer();
resetHousekeepingTimer();
  if (appState.supabase) {
    window.__hccBootState.phase = 'loading-shared-config';
    setStatus('Loading household config…');
    await fetchHouseholdConfig();
  }
  if (!appState.supabase) {
    setStatus('Supabase settings needed.');
    renderEmptyShell('Open Settings and add your Supabase URL and anon key to start.');
    return;
  }
  window.__hccBootState.phase = 'loading-device-profile';
  setStatus('Loading device profile…');
  const deviceProfileReady = await safeLoadDeviceProfile();
  window.__hccBootState.deviceProfileReady = deviceProfileReady;
  if (!deviceProfileReady) {
    window.setTimeout(() => {
      if (appState.supabase) safeLoadDeviceProfile();
    }, 0);
  }
  window.__hccBootState.phase = 'loading-household-data';
  setStatus('Loading household data…');
  await withTimeout(refreshAll(), BOOT_TIMEOUT_MS, 'Initial data load timed out');
  bindRealtime();
  fetchGoogleCalendarSnapshots().catch((error) => console.warn('Initial scheduled calendar refresh failed', error));
  runHousekeeping(false).catch((error) => console.warn('Initial housekeeping failed', error));
  await syncWakeLock({ force: true });
  window.__hccBootState.phase = 'ready';
  window.__hccBootState.finished = true;
}


function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

async function safeLoadDeviceProfile() {
  try {
    await withTimeout(loadDeviceProfile(), BOOT_TIMEOUT_MS, 'Device profile timed out');
    return true;
  } catch (error) {
    console.warn('Device profile load warning:', error);
    pushDevLog('warn', `Device profile load warning: ${error.message}`);
    setStatus(`Device profile warning: ${error.message}`);
    return false;
  }
}


async function ensureSupabase() {
  const { supabaseUrl, supabaseKey } = appState.config;
  if (!supabaseUrl || !supabaseKey) {
    setStatus('Supabase settings needed.');
    return;
  }
  const supabaseLib = await waitForSupabaseGlobal();
  appState.supabase = supabaseLib.createClient(supabaseUrl, supabaseKey);
}



async function waitForSupabaseGlobal(timeoutMs = 6000) {
  const started = getNowMs();
  while (getNowMs() - started < timeoutMs) {
    if (window.supabase && typeof window.supabase.createClient === 'function') return window.supabase;
    if (window.__hccSupabaseLoadError) {
      throw new Error('Supabase library failed to load');
    }
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  throw new Error('Supabase library unavailable');
}

function hasLocalConfig() {
  try {
    return !!localStorage.getItem(CONFIG_STORAGE);
  } catch {
    return false;
  }
}

function markHostedSettingsChecked() {
  try {
    localStorage.setItem(SETTINGS_JSON_AUTOLOAD_DONE, 'true');
  } catch {}
}

function normalizeExternalConfig(input) {
  if (!input || typeof input !== 'object') return null;
  const taskMapping = input.taskMapping || {};
  const ui = input.ui || {};
  return {
    ...DEFAULT_CONFIG,
    ...input,
    supabaseUrl: String(input.supabaseUrl || DEFAULT_CONFIG.supabaseUrl || '').trim(),
    supabaseKey: String(input.supabaseKey || input.supabaseAnonKey || DEFAULT_CONFIG.supabaseKey || '').trim(),
    deviceName: String(input.deviceName || DEFAULT_CONFIG.deviceName || 'New device').trim(),
    mode: input.mode || DEFAULT_CONFIG.mode,
    location: input.location || DEFAULT_CONFIG.location,
    taskDateField: taskMapping.dueDate || input.taskDateField || DEFAULT_CONFIG.taskDateField,
    taskOwnerField: taskMapping.owner || input.taskOwnerField || DEFAULT_CONFIG.taskOwnerField,
    taskTitleField: taskMapping.title || input.taskTitleField || DEFAULT_CONFIG.taskTitleField,
    taskCompletedField: taskMapping.completed || input.taskCompletedField || DEFAULT_CONFIG.taskCompletedField,
    uiRefreshSeconds: Math.max(15, Number(ui.refreshSeconds || input.uiRefreshSeconds || DEFAULT_CONFIG.uiRefreshSeconds) || DEFAULT_CONFIG.uiRefreshSeconds),
    googleClientId: String(input.googleClientId || input.googleOAuthClientId || DEFAULT_CONFIG.googleClientId || '').trim(),
    weatherLocationQuery: String((input.weather && input.weather.locationQuery) || input.weatherLocationQuery || DEFAULT_CONFIG.weatherLocationQuery || '').trim(),
    weatherLocationName: String((input.weather && input.weather.locationName) || input.weatherLocationName || DEFAULT_CONFIG.weatherLocationName || '').trim(),
    weatherLatitude: String((input.weather && input.weather.latitude) || input.weatherLatitude || DEFAULT_CONFIG.weatherLatitude || '').trim(),
    weatherLongitude: String((input.weather && input.weather.longitude) || input.weatherLongitude || DEFAULT_CONFIG.weatherLongitude || '').trim(),
    weatherTimezone: String((input.weather && input.weather.timezone) || input.weatherTimezone || DEFAULT_CONFIG.weatherTimezone || '').trim(),
    keepScreenAwake: typeof input.keepScreenAwake === 'boolean' ? input.keepScreenAwake : DEFAULT_CONFIG.keepScreenAwake,
  };
}

async function loadHostedSettingsOnce() {
  if (hasLocalConfig()) {
    pushDevLog('info', 'Using saved local settings.');
    return false;
  }
  try {
    const alreadyChecked = localStorage.getItem(SETTINGS_JSON_AUTOLOAD_DONE) === 'true';
    if (alreadyChecked) {
      pushDevLog('info', 'No local settings found. Hosted settings were already checked before.');
      return false;
    }
  } catch {}

  try {
    const response = await fetch('./settings.json', { cache: 'no-store' });
    if (!response.ok) {
      markHostedSettingsChecked();
      pushDevLog('warn', `settings.json not loaded (${response.status})`);
      return false;
    }
    const raw = await response.json();
    const normalized = normalizeExternalConfig(raw);
    if (!normalized?.supabaseUrl || !normalized?.supabaseKey) {
      markHostedSettingsChecked();
      pushDevLog('warn', 'settings.json found, but Supabase URL/key were incomplete.');
      return false;
    }
    appState.config = normalized;
    persistLocalConfig();
    markHostedSettingsChecked();
    pushDevLog('info', 'Loaded hosted settings from settings.json');
    setStatus('Loaded hosted settings.');
    return true;
  } catch (error) {
    markHostedSettingsChecked();
    pushDevLog('warn', `settings.json load failed: ${error?.message || error}`);
    return false;
  }
}

async function loadDeviceProfile() {
  const readStartedAt = startIoOperation('reads', 'deviceProfile', 'startup');
  try {
    const { data, error } = await appState.supabase
      .from('device_profiles')
      .select('*')
      .eq('device_key', appState.deviceKey)
      .maybeSingle();

    if (error) throw error;

    finishIoOperation('reads', 'deviceProfile', readStartedAt, { ok: true, rows: data ? 1 : 0, reason: 'startup' });

    if (data) {
      appState.deviceProfile = data;
      applyDeviceProfileToConfig(data);
      persistLocalConfig();
      fillSettingsForm();
      setStatus(`Connected as ${appState.config.deviceName} (${appState.config.mode})`);
      return;
    }

    const insertPayload = buildDeviceProfilePayload();
    const writeStartedAt = startIoOperation('writes', 'deviceProfileInsert', 'startup');

    const { data: inserted, error: insertError } = await appState.supabase
      .from('device_profiles')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) throw insertError;
    finishIoOperation('writes', 'deviceProfileInsert', writeStartedAt, { ok: true, rows: inserted ? 1 : 0, reason: 'startup' });
    appState.deviceProfile = inserted;
    setStatus(`Created device profile for ${appState.config.deviceName}`);
  } catch (error) {
    finishIoOperation('reads', 'deviceProfile', readStartedAt, { ok: false, reason: 'startup', error: error?.message || String(error) });
    console.error(error);
    setStatus(`Device profile warning: ${error.message}`);
  }
}

function renderRuntimeUi(options = {}) {
  if (options.renderMode !== false) renderMode();
  renderTrustIndicator();
  placeInlineTrustIndicator();
  if (options.renderDevConsole !== false) renderDevConsole();
}

function renderApp() {
  renderRuntimeUi();
}

async function refreshBaseState(includeSlowState = false) {
  const work = [
    fetchTasks(),
    fetchSignals(),
    fetchLoads(),
  ];
  if (includeSlowState) {
    work.push(fetchSnapshots(), fetchRecentLogs());
  }

  const results = await Promise.allSettled(work);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Base refresh issue', result.reason);
    }
  }
}

async function refreshOptionalState() {
  const followup = await Promise.allSettled([
    fetchWeatherSnapshot(),
  ]);

  for (const result of followup) {
    if (result.status === 'rejected') {
      console.warn('Follow-up refresh issue', result.reason);
    }
  }
}

async function runFullRefreshCycle(reason = 'manual refresh', options = {}) {
  const includeSlowState = !!options.includeSlowState;
  const startedAt = Date.now();
  noteRefreshIo('full', reason, 0);
  setStatus(`Refreshing ${appState.config.mode} view…`);
  pushDevLog('info', `Starting full refresh: ${reason}${includeSlowState ? ' (with slow state)' : ''}.`);
  await refreshBaseState(includeSlowState);

  // Render immediately from shared/base data so headless displays never block on optional enrichments.
  renderRuntimeUi();

  await refreshOptionalState();

  renderRuntimeUi();
  appState.refreshCoordinator.lastReason = reason;
  appState.refreshCoordinator.lastCompletedAt = new Date().toISOString();
  noteRefreshIo('full', reason, Date.now() - startedAt);
  setStatus(`Showing ${appState.config.mode} mode · Updated ${getNowDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
}

async function refreshAll(reason = 'manual refresh', options = {}) {
  if (!appState.supabase) {
    setStatus('Supabase settings needed.');
    return;
  }

  const coordinator = appState.refreshCoordinator || (appState.refreshCoordinator = {
    inFlight: null,
    pendingReason: '',
    pendingOptions: null,
    lastReason: '',
    lastCompletedAt: '',
  });

  if (coordinator.inFlight) {
    coordinator.pendingReason = coordinator.pendingReason || reason || 'queued refresh';
    coordinator.pendingOptions = { ...(coordinator.pendingOptions || {}), ...(options || {}) };
    noteRefreshIo('queued', coordinator.pendingReason, 0);
    pushDevLog('info', `Refresh already running; queued ${coordinator.pendingReason}.`);
    return coordinator.inFlight;
  }

  coordinator.pendingReason = coordinator.pendingReason || reason || 'manual refresh';
  coordinator.pendingOptions = { ...(coordinator.pendingOptions || {}), ...(options || {}) };
  coordinator.inFlight = (async () => {
    while (coordinator.pendingReason) {
      const nextReason = coordinator.pendingReason;
      const nextOptions = coordinator.pendingOptions || {};
      coordinator.pendingReason = '';
      coordinator.pendingOptions = null;
      try {
        await runFullRefreshCycle(nextReason, nextOptions);
      } catch (error) {
        handleRuntimeActionError('Refresh failed', error);
        renderRuntimeUi({ renderMode: false });
        throw error;
      }
    }
  })().finally(() => {
    coordinator.inFlight = null;
  });

  return coordinator.inFlight;
}

async function runTargetedRefresh(label, refreshWork, options = {}) {
  const successMessage = options.successMessage || `${label} applied without full refresh.`;
  const startedAt = Date.now();
  noteRefreshIo('targeted', label, 0);
  try {
    await refreshWork();
    renderRuntimeUi(options.renderOptions || {});
    noteRefreshIo('targeted', label, Date.now() - startedAt);
    pushDevLog('info', successMessage);
  } catch (error) {
    console.warn(`${label} issue`, error);
    pushDevLog('warn', `${label} failed: ${error?.message || error}`);
    if (options.rethrow) throw error;
  }
}

function fieldExistsOnTask(fieldName, sample) {
  return !!fieldName && !!sample && Object.prototype.hasOwnProperty.call(sample, fieldName);
}

function detectTaskField(sample, configKey) {
  const configured = appState.config[configKey];
  if (fieldExistsOnTask(configured, sample)) return configured;
  const candidates = TASK_FIELD_CANDIDATES[configKey] || [];
  return candidates.find((candidate) => fieldExistsOnTask(candidate, sample)) || configured;
}

function maybeAutoMapTaskFields(tasks) {
  const sample = tasks?.[0];
  if (!sample) return;
  const updates = {};
  for (const key of Object.keys(TASK_FIELD_CANDIDATES)) {
    const detected = detectTaskField(sample, key);
    if (detected && appState.config[key] !== detected) {
      updates[key] = detected;
    }
  }
  if (Object.keys(updates).length) {
    Object.assign(appState.config, updates);
    persistLocalConfig();
    fillSettingsForm();
    pushDevLog('info', `Auto-mapped task fields: ${Object.entries(updates).map(([k, v]) => `${k}→${v}`).join(', ')}`);
  }
}

function taskIsCompleted(task) {
  if (!task) return false;

  const candidateValues = [];
  const configuredField = appState.config.taskCompletedField;
  if (configuredField && configuredField in task) {
    candidateValues.push(task[configuredField]);
  }

  ['completed', 'done', 'is_completed', 'is_done', 'complete', 'panel', 'completed_at'].forEach((field) => {
    if (field in task) candidateValues.push(task[field]);
  });

  for (const value of candidateValues) {
    if (appState.config.useStringCompleted && String(value) === String(appState.config.taskCompletedValue)) return true;
    if (typeof value === 'boolean' && value) return true;
    if (typeof value === 'string' && ['true', 'completed', 'done', 'yes', '1'].includes(value.toLowerCase())) return true;
    if (typeof value === 'number' && value === 1) return true;
  }

  if (typeof task.panel === 'string' && ['done', 'completed'].includes(task.panel.toLowerCase())) return true;
  if (task.completed_at) return true;
  if (typeof task.status === 'string' && ['done', 'completed'].includes(task.status.toLowerCase())) return true;
  return false;
}

function taskIsArchived(task) {
  if (!task) return false;
  if (task.archived === true || task.archived === 1) return true;
  if (typeof task.archived === 'string' && ['true', '1', 'yes'].includes(task.archived.toLowerCase())) return true;
  if (task.archived_at) return true;
  if (typeof task.panel === 'string' && task.panel.toLowerCase() === 'archived') return true;
  if (typeof task.status === 'string' && task.status.toLowerCase() === 'archived') return true;
  return false;
}

function isRealtimeHealthy() {
  const diag = appState.realtimeDiagnostics || {};
  return !!appState.supabase && Number(diag.activeChannels || 0) > 0 && diag.lastStatus === 'SUBSCRIBED';
}

function getAutoRefreshSeconds() {
  const configured = Math.max(15, Number(appState.config.uiRefreshSeconds) || DEFAULT_CONFIG.uiRefreshSeconds);
  if (isRealtimeHealthy()) return Math.max(HEALTHY_AUTO_REFRESH_SECONDS, configured);
  return Math.min(configured, DEGRADED_AUTO_REFRESH_SECONDS);
}

function taskQueryCandidateFilters(baseQuery, completedField) {
  return [
    () => baseQuery.eq(completedField, false),
    () => baseQuery.eq(completedField, 'false'),
    () => baseQuery.eq(completedField, 0),
    () => baseQuery.or(`${completedField}.is.null,${completedField}.eq.false`),
  ];
}

function buildTaskBaseQuery(taskTable, options = {}) {
  const { includeOlderDone = false } = options;
  const query = appState.supabase
    .from(taskTable)
    .select('*')
    .is('archived_at', null)
    .or('archived.is.null,archived.eq.false')
    .order('updated_at', { ascending: false })
    .limit(120);

  if (!includeOlderDone) {
    const recentDoneCutoff = new Date(Date.now() - RECENT_DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    query.or(`completed_at.is.null,completed_at.gte.${recentDoneCutoff}`);
  }

  return query;
}

async function fetchTasks(options = {}) {
  const { taskTable } = appState.config;
  const completedField = appState.config.taskCompletedField;
  const buildBaseQuery = () => buildTaskBaseQuery(taskTable, options);
  const ioStartedAt = startIoOperation('reads', 'tasks', 'fetchTasks');

  let data = null;
  let error = null;

  if (completedField) {
    if (appState.config.useStringCompleted) {
      ({ data, error } = await buildBaseQuery().neq(completedField, appState.config.taskCompletedValue));
    } else {
      const attempts = taskQueryCandidateFilters(buildBaseQuery(), completedField);
      for (const attempt of attempts) {
        ({ data, error } = await attempt());
        if (!error) break;
      }
    }
  }

  if (!data && !error) {
    ({ data, error } = await buildBaseQuery());
  } else if (error) {
    ({ data, error } = await buildBaseQuery());
  }

  if (error) {
    finishIoOperation('reads', 'tasks', ioStartedAt, { ok: false, reason: 'fetchTasks', error: error?.message || String(error) });
    console.warn('Task fetch issue', error);
    pushDevLog('warn', `Task fetch issue; keeping ${appState.tasks.length} cached task${appState.tasks.length === 1 ? '' : 's'}.`);
    return;
  }

  const rows = data || [];
  finishIoOperation('reads', 'tasks', ioStartedAt, { ok: true, rows: rows.length, reason: 'fetchTasks' });
  maybeAutoMapTaskFields(rows);
  appState.tasks = rows.filter((task) => !taskIsCompleted(task) && !taskIsArchived(task));
  pushDevLog('info', `Fetched ${appState.tasks.length} visible tasks from ${taskTable} (${RECENT_DONE_WINDOW_DAYS}d recent-done query window)`);
}


function loadSignalSnoozes() {
  try {
    const raw = localStorage.getItem(SIGNAL_SNOOZE_STORAGE);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistSignalSnoozes(map) {
  try {
    localStorage.setItem(SIGNAL_SNOOZE_STORAGE, JSON.stringify(map || {}));
  } catch (_) {}
}

function isSignalLocallySnoozed(signal, now = getNowDate()) {
  const id = signal?.id;
  if (!id) return false;
  const snoozes = loadSignalSnoozes();
  const until = snoozes[id];
  if (!until) return false;
  const untilMs = new Date(until).getTime();
  if (!Number.isFinite(untilMs)) {
    delete snoozes[id];
    persistSignalSnoozes(snoozes);
    return false;
  }
  if (untilMs <= now.getTime()) {
    delete snoozes[id];
    persistSignalSnoozes(snoozes);
    return false;
  }
  return true;
}

function locallySnoozeSignal(signal, minutes = 120) {
  const id = signal?.id;
  if (!id) return;
  const snoozes = loadSignalSnoozes();
  const until = new Date(getNowDate().getTime() + minutes * 60000).toISOString();
  snoozes[id] = until;
  persistSignalSnoozes(snoozes);
}


function readDerivedSignalMemory() {
  try {
    const raw = localStorage.getItem(DERIVED_SIGNAL_MEMORY_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistDerivedSignalMemory(memory) {
  try {
    localStorage.setItem(DERIVED_SIGNAL_MEMORY_STORAGE, JSON.stringify(memory || {}));
  } catch (_) {}
}

function selectDerivedSignalWithMemory(candidates = [], now = getNowDate()) {
  const sorted = [...(Array.isArray(candidates) ? candidates : [])].sort((a, b) => {
    const scoreDelta = scoreSignalPriority(b, { now }) - scoreSignalPriority(a, { now });
    if (scoreDelta) return scoreDelta;
    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
  if (!sorted.length) {
    persistDerivedSignalMemory({});
    return [];
  }

  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const memory = readDerivedSignalMemory();
  const suppressAllClearUntil = Number(memory.suppressAllClearUntil || 0);
  const eligible = sorted.filter((signal) => {
    if (String(signal?.signal_type || '') !== 'derived_all_clear') return true;
    return suppressAllClearUntil <= nowMs;
  });
  const withoutAllClear = sorted.filter((signal) => String(signal?.signal_type || '') !== 'derived_all_clear');
  const visible = eligible.length ? eligible : (withoutAllClear.length ? withoutAllClear : sorted);
  if (!visible.length) return [];

  let chosen = visible[0];
  const previousType = String(memory.lastSignalType || '');
  const holdUntil = Number(memory.holdUntil || 0);
  const previous = visible.find((signal) => String(signal?.signal_type || '') === previousType);

  if (previous && holdUntil > nowMs) {
    const previousScore = scoreSignalPriority(previous, { now });
    const currentScore = scoreSignalPriority(visible[0], { now });
    const scoreGap = currentScore - previousScore;
    if (scoreGap <= 18) chosen = previous;
  }

  const chosenType = String(chosen?.signal_type || '');
  const currentHold = Number(memory.holdUntil || 0);
  const isWarning = String(chosen?.severity || '').toLowerCase() === 'warning';
  const defaultHoldMs = isWarning ? (10 * 60 * 1000) : (15 * 60 * 1000);
  const nextMemory = {
    lastSignalType: chosenType,
    lastSignalId: String(chosen?.id || ''),
    shownAt: chosenType === previousType ? Number(memory.shownAt || nowMs) : nowMs,
    holdUntil: chosenType === previousType && currentHold > nowMs ? currentHold : (nowMs + defaultHoldMs),
    suppressAllClearUntil: chosenType === 'derived_all_clear'
      ? suppressAllClearUntil
      : Math.max(suppressAllClearUntil, nowMs + (20 * 60 * 1000)),
  };
  persistDerivedSignalMemory(nextMemory);
  return [chosen];
}

function getRemoteWriteGuard(tableName = '') {
  const connection = appState.connectionStatus || {};
  const sw = appState.serviceWorkerDiagnostics || {};
  const reasons = [];

  if (!appState.supabase) reasons.push('Supabase is not connected yet.');
  if (sw.mismatch) reasons.push(sw.mismatchReason || 'This display is running a stale version.');
  if ((connection.supabase?.level || '').toLowerCase() === 'error') reasons.push(connection.supabase?.text || 'Supabase connection failed.');

  const lowered = String(tableName || '').toLowerCase();
  if (lowered === 'tasks' && (connection.tasks?.level || '').toLowerCase() === 'error') {
    reasons.push(connection.tasks?.text || 'Tasks are not reachable right now.');
  }
  if (lowered === 'device_profiles' && (connection.deviceProfile?.level || '').toLowerCase() === 'error') {
    reasons.push(connection.deviceProfile?.text || 'Device profile checks are failing.');
  }

  return {
    allowed: reasons.length === 0,
    reason: reasons[0] || '',
  };
}

function clearArmedTaskCompletion(taskId) {
  if (!taskId) return;
  const existingTimer = armedTaskCompletions.get(taskId);
  if (existingTimer) window.clearTimeout(existingTimer);
  armedTaskCompletions.delete(taskId);
}

function armTaskCompletion(taskId) {
  if (!taskId) return false;
  clearArmedTaskCompletion(taskId);
  const timer = window.setTimeout(() => {
    armedTaskCompletions.delete(taskId);
    renderRuntimeUi({ renderDevConsole: false });
  }, TASK_COMPLETE_ARM_WINDOW_MS);
  armedTaskCompletions.set(taskId, timer);
  return true;
}

function isTaskCompletionArmed(taskId) {
  return !!taskId && armedTaskCompletions.has(taskId);
}

function getDisplayItemKey(item = {}) {
  if (item.itemKey) return item.itemKey;
  if (item.id != null) return `id:${item.id}`;
  return `title:${item.title || ''}|meta:${item.meta || ''}|pill:${item.pill || ''}`;
}

async function dismissSignal(signal) {
  const signalId = signal?.id;
  if (!signalId || pendingSignalActions.has(`dismiss:${signalId}`)) return;
  if (signal?.metadata?.synthetic) {
    showToast('Synthetic signals can be snoozed, not dismissed', 'info');
    return;
  }

  const writeGuard = getRemoteWriteGuard('household_signals');
  if (!writeGuard.allowed) {
    showToast(writeGuard.reason || 'Live connection is degraded. Signal not dismissed.', 'warning', { durationMs: 2400 });
    setStatus(`Blocked signal dismiss: ${writeGuard.reason || 'write path not ready'}`);
    return;
  }

  pendingSignalActions.add(`dismiss:${signalId}`);
  const previousSignals = [...(appState.signals || [])];
  appState.signals = (appState.signals || []).filter((item) => item && item.id !== signalId);
  renderRuntimeUi({ renderDevConsole: false });
  const ioStartedAt = startIoOperation('writes', 'signals', 'dismissSignal');

  try {
    const { error } = await appState.supabase
      .from('household_signals')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', signalId);
    if (error) throw error;
    finishIoOperation('writes', 'signals', ioStartedAt, { ok: true, reason: 'dismissSignal' });
    showToast('Signal dismissed', 'success');
    setStatus(`Dismissed signal: ${signal?.title || 'Signal'}`);
  } catch (error) {
    finishIoOperation('writes', 'signals', ioStartedAt, { ok: false, reason: 'dismissSignal', error: error?.message || String(error) });
    appState.signals = previousSignals;
    renderRuntimeUi({ renderDevConsole: false });
    console.error(error);
    showToast('Could not dismiss signal — restored on screen', 'error', { durationMs: 2400 });
    setStatus(`Could not dismiss signal: ${error.message}`);
  } finally {
    pendingSignalActions.delete(`dismiss:${signalId}`);
  }
}

function snoozeSignal(signal, minutes = 120) {
  const signalId = signal?.id;
  if (!signalId || pendingSignalActions.has(`snooze:${signalId}`)) return;
  pendingSignalActions.add(`snooze:${signalId}`);
  try {
    locallySnoozeSignal(signal, minutes);
    renderRuntimeUi({ renderDevConsole: false });
    showToast(`Signal snoozed for ${minutes}m`, 'success');
    setStatus(`Snoozed signal: ${signal?.title || 'Signal'}`);
  } finally {
    window.setTimeout(() => pendingSignalActions.delete(`snooze:${signalId}`), 250);
  }
}

async function fetchSignals() {
  const ioStartedAt = startIoOperation('reads', 'signals', 'fetchSignals');
  const { data, error } = await appState.supabase
    .from('household_signals')
    .select('*')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(12);
  if (error) {
    finishIoOperation('reads', 'signals', ioStartedAt, { ok: false, reason: 'fetchSignals', error: error?.message || String(error) });
    console.warn('Signal fetch issue', error);
    pushDevLog('warn', `Signal fetch issue; keeping ${appState.signals.length} cached signal${appState.signals.length === 1 ? '' : 's'}.`);
    return;
  }
  appState.signals = data || [];
  finishIoOperation('reads', 'signals', ioStartedAt, { ok: true, rows: appState.signals.length, reason: 'fetchSignals' });
}


function sortLoads(loads) {
  const items = Array.isArray(loads) ? [...loads] : [];
  return items.sort((a, b) => {
    const aDone = !!(a && (a.archived_at || a.completed_at || a.status === 'done'));
    const bDone = !!(b && (b.archived_at || b.completed_at || b.status === 'done'));
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aTime = Date.parse((a && (a.created_at || a.last_transition_at || a.updated_at)) || '') || 0;
    const bTime = Date.parse((b && (b.created_at || b.last_transition_at || b.updated_at)) || '') || 0;
    return aTime - bTime;
  });
}

async function fetchLoads() {
  const ioStartedAt = startIoOperation('reads', 'loads', 'fetchLoads');
  const { data, error } = await appState.supabase
    .from('laundry_loads')
    .select('*')
    .is('archived_at', null)
    .neq('status', 'done')
    .order('created_at', { ascending: true })
    .limit(25);
  if (error) {
    finishIoOperation('reads', 'loads', ioStartedAt, { ok: false, reason: 'fetchLoads', error: error?.message || String(error) });
    console.warn('Laundry fetch issue', error);
    pushDevLog('warn', `Laundry fetch issue; keeping ${appState.loads.length} cached load${appState.loads.length === 1 ? '' : 's'}.`);
    return;
  }
  appState.loads = sortLoads(data || []);
  finishIoOperation('reads', 'loads', ioStartedAt, { ok: true, rows: appState.loads.length, reason: 'fetchLoads' });
}

async function fetchSnapshots() {
  const ioStartedAt = startIoOperation('reads', 'snapshots', 'fetchSnapshots');
  const types = [
    appState.config.weatherSnapshotType,
    appState.config.calendarTodaySnapshotType,
    appState.config.calendarTomorrowSnapshotType,
  ];
  const { data, error } = await appState.supabase
    .from('context_snapshots')
    .select('*')
    .in('context_type', types)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) {
    finishIoOperation('reads', 'snapshots', ioStartedAt, { ok: false, reason: 'fetchSnapshots', error: error?.message || String(error) });
    console.warn('Snapshot fetch issue', error);
    return;
  }
  const snapshots = { ...appState.snapshots };
  for (const rawItem of data || []) {
    const item = { ...rawItem };
    if (typeof item.payload === 'string') {
      try {
        item.payload = JSON.parse(item.payload);
      } catch (e) {
        pushDevLog('warn', `Could not parse snapshot payload for ${item.context_type}.`);
        item.payload = { items: [] };
      }
    }
    if (!snapshots[item.context_type]) {
      snapshots[item.context_type] = item;
      continue;
    }
    const existing = snapshots[item.context_type];
    const existingTime = new Date(existing.created_at || 0).getTime();
    const incomingTime = new Date(item.created_at || 0).getTime();
    if (!Number.isFinite(existingTime) || incomingTime >= existingTime) {
      snapshots[item.context_type] = item;
    }
  }
  appState.snapshots = snapshots;
  finishIoOperation('reads', 'snapshots', ioStartedAt, { ok: true, rows: (data || []).length, reason: 'fetchSnapshots' });
}


async function refreshWeatherOnly() {
  try {
    pushDevLog('info', 'Starting weather refresh.');
    await fetchWeatherSnapshot();
    renderRuntimeUi();
    showToast('Weather refreshed', 'success');
  } catch (error) {
    handleRuntimeActionError('Weather refresh failed', error);
    renderRuntimeUi({ renderMode: false });
    showToast('Weather refresh failed', 'error');
  }
}

async function refreshFromSnapshotUpdate() {
  await runTargetedRefresh('Snapshot-only refresh', async () => {
    await fetchSnapshots();
  });
}

async function fetchRecentLogs() {
  const ioStartedAt = startIoOperation('reads', 'logs', 'fetchRecentLogs');
  const { data, error } = await appState.supabase
    .from('household_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(6);
  if (error) {
    finishIoOperation('reads', 'logs', ioStartedAt, { ok: false, reason: 'fetchRecentLogs', error: error?.message || String(error) });
    console.warn('Log fetch issue', error);
    pushDevLog('warn', `Log fetch issue; keeping ${appState.logs.length} cached log entr${appState.logs.length === 1 ? 'y' : 'ies'}.`);
    return;
  }
  appState.logs = data || [];
  finishIoOperation('reads', 'logs', ioStartedAt, { ok: true, rows: appState.logs.length, reason: 'fetchRecentLogs' });
}


function updateRealtimeDiagnostics(patch = {}) {
  const current = appState.realtimeDiagnostics || {};
  appState.realtimeDiagnostics = { ...current, ...patch, channelStates: patch.channelStates || current.channelStates || {} };
}

function getRealtimeStatusText() {
  const diag = appState.realtimeDiagnostics || {};
  const activeChannels = Number(diag.activeChannels || 0);
  const lastEventTable = diag.lastEventTable ? ` · last ${diag.lastEventTable}` : '';
  if (!appState.supabase) return 'Not configured';
  if (!activeChannels) return 'No active channels';
  if (diag.lastStatus === 'SUBSCRIBED') return `${activeChannels} channels active${lastEventTable}`;
  if (diag.lastStatus) return `${diag.lastStatus}${lastEventTable}`;
  return `${activeChannels} channels configured${lastEventTable}`;
}

function setRealtimeConnectionStatus(level = 'unknown', fallbackText = '') {
  setConnectionStatus('realtime', level, fallbackText || getRealtimeStatusText());
}

function buildRealtimeChannelSpecs() {
  return [
    { table: appState.config.taskTable, event: '*', scope: 'targeted', reason: 'task realtime update', handler: () => runTargetedRefresh('Task realtime update', async () => {
        await fetchTasks();
      }) },
    { table: 'household_logs', event: '*', scope: 'targeted', reason: 'log realtime update', handler: () => runTargetedRefresh('Log realtime update', async () => {
        await fetchRecentLogs();
      }) },
    { table: 'household_signals', event: '*', scope: 'targeted', reason: 'signal realtime update', handler: () => runTargetedRefresh('Signal realtime update', async () => {
        await fetchSignals();
      }) },
    { table: 'laundry_loads', event: '*', scope: 'targeted', reason: 'laundry realtime update', handler: () => runTargetedRefresh('Laundry realtime update', async () => {
        await fetchLoads();
      }) },
    { table: 'context_snapshots', event: '*', scope: 'targeted', reason: 'snapshot realtime update', handler: () => refreshFromSnapshotUpdate() },
    { table: SHARED_CONFIG_TABLE, event: '*', scope: 'targeted', reason: 'shared config realtime update', handler: () => runTargetedRefresh('Shared config update', async () => {
        await fetchHouseholdConfig();
      }) },
  ];
}

function handleRealtimeEvent(spec, payload) {
  updateRealtimeDiagnostics({
    lastEventAt: new Date().toISOString(),
    lastEventTable: spec.table,
    lastEventType: payload?.eventType || spec.event || '*',
  });
  setRealtimeConnectionStatus('ok');
  return spec.handler(payload);
}

function noteRealtimeSubscriptionStatus(table, status) {
  const channelStates = {
    ...((appState.realtimeDiagnostics && appState.realtimeDiagnostics.channelStates) || {}),
    [table]: status,
  };
  updateRealtimeDiagnostics({
    subscribedAt: appState.realtimeDiagnostics?.subscribedAt || new Date().toISOString(),
    activeChannels: Object.keys(channelStates).length,
    channelStates,
    lastStatus: status || '',
  });
  const level = status === 'SUBSCRIBED' ? 'ok' : (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'warn' : 'unknown');
  setRealtimeConnectionStatus(level);
  resetAutoRefreshTimer();
resetSlowStateBackstopTimer();
resetCalendarPublishTimer();
resetHousekeepingTimer();
  pushDevLog(level === 'ok' ? 'info' : 'warn', `Realtime ${table}: ${status}`);
}

function bindRealtime() {
  clearSubscriptions();
  if (!appState.supabase) {
    setRealtimeConnectionStatus('unknown', 'Not configured');
    return;
  }
  const channels = buildRealtimeChannelSpecs();
  updateRealtimeDiagnostics({
    subscribedAt: new Date().toISOString(),
    activeChannels: channels.length,
    channelStates: {},
    lastStatus: 'SUBSCRIBING',
  });
  setRealtimeConnectionStatus('unknown', 'Subscribing…');

  appState.subscriptions = channels.map((spec) => {
    const channel = appState.supabase
      .channel(`realtime-${spec.table}`)
      .on('postgres_changes', { event: spec.event, schema: 'public', table: spec.table }, (payload) => handleRealtimeEvent(spec, payload))
      .subscribe((status) => noteRealtimeSubscriptionStatus(spec.table, status));
    return { table: spec.table, channel };
  });
}

function clearSubscriptions() {
  if (!appState.subscriptions?.length || !appState.supabase) {
    updateRealtimeDiagnostics({ activeChannels: 0, channelStates: {}, lastStatus: '' });
    return;
  }
  for (const entry of appState.subscriptions) appState.supabase.removeChannel(entry.channel || entry);
  appState.subscriptions = [];
  updateRealtimeDiagnostics({ activeChannels: 0, channelStates: {}, lastStatus: 'CLEARED' });
  setRealtimeConnectionStatus('unknown', 'Channels cleared');
}


const SURFACE_DEFINITIONS = {
  kitchen: {
    bodyClasses: ['widget-surface', 'kitchen-surface'],
    screenClass: 'screen two-columns widget-layout widget-layout-kitchen',
    widgets: [
      'context',
      'quickActions',
      'kitchenHeader',
      'signals',
      'forget',
      'spotlight',
      'upcoming',
    ],
  },
  tv: {
    bodyClasses: ['widget-surface', 'tv-surface'],
    screenClass: 'screen single-column widget-layout widget-layout-tv',
    widgets: ['tvHero', 'tvSignals', 'tvToday', 'tvMotion', 'tvForget'],
  },
  laundry: {
    bodyClasses: ['widget-surface', 'laundry-surface'],
    screenClass: 'screen single-column widget-layout widget-layout-laundry',
    widgets: ['laundrySummary', 'laundryLoads', 'laundrySignals'],
  },
  bedroom: {
    bodyClasses: ['widget-surface', 'bedroom-surface'],
    screenClass: 'screen single-column bedroom-layout widget-layout widget-layout-bedroom',
    widgets: ['context', 'bedroomPrimary', 'bedroomLaundry', 'bedroomForget'],
  },
  mobile: {
    bodyClasses: ['mobile-surface'],
    screenClass: 'screen two-columns widget-layout widget-layout-mobile',
    widgets: ['today', 'laundryLoads', 'upcoming', 'recentLogs', 'signals', 'quickActions', 'context', 'taskMapping'],
  },
};

const SURFACE_BODY_CLASS_NAMES = ['tv-mode', 'mobile-mode', 'widget-surface', 'tv-surface', 'kitchen-surface', 'laundry-surface', 'bedroom-surface', 'mobile-surface'];

function getSurfaceDefinition(mode) {
  return SURFACE_DEFINITIONS[mode] || SURFACE_DEFINITIONS.kitchen;
}

function applySurfaceBodyClasses(mode) {
  const surface = getSurfaceDefinition(mode);
  for (const className of SURFACE_BODY_CLASS_NAMES) {
    document.body.classList.remove(className);
  }
  for (const className of surface.bodyClasses || []) {
    document.body.classList.add(className);
  }
  document.body.classList.toggle('tv-mode', mode === 'tv');
  document.body.classList.toggle('mobile-mode', mode === 'mobile');
}

function renderMode() {
  const mode = appState.config.mode || 'tv';
  applySurfaceBodyClasses(mode);
  const digest = buildTaskDigest();
  const widgetContext = buildWidgetContext(digest);
  if (mode === 'mobile') {
    renderMobileControlPanel(widgetContext);
    updateCalendarAuthBanner();
    return;
  }
  renderModeLayout(mode, widgetContext);
  updateCalendarAuthBanner();
}

function buildWidgetContext(digest) {
  const signals = activeSignals();
  const tomorrowItems = buildTomorrowItemsFromDigest(digest);
  const forgetItems = buildForgetItemsFromSignals(signals, tomorrowItems, digest);
  return {
    mode: appState.config.mode,
    digest,
    signals,
    tomorrowItems,
    forgetItems,
    focusItem: buildSoftFocusFromDigest(digest, signals),
    isEvening: isEvening(),
    presentationPhase: getPresentationPhase(),
  };
}

function renderModeLayout(mode, context) {
  const layout = getSurfaceDefinition(mode);
  screenEl.className = layout.screenClass;
  screenEl.replaceChildren();

  const ambientFooter = mode !== 'mobile' ? buildAmbientFooter() : null;

  if (mode === 'tv') {
    const tvWrap = document.createElement('div');
    tvWrap.className = 'tv-layout tv-layout-wide';
    for (const widgetId of layout.widgets) {
      const node = renderWidget(widgetId, context);
      if (node) tvWrap.append(node);
    }
    screenEl.append(tvWrap);
    if (ambientFooter) screenEl.append(ambientFooter);
    return;
  }

  for (const widgetId of layout.widgets) {
    const node = renderWidget(widgetId, context);
    if (node) screenEl.append(node);
  }

  if (ambientFooter) screenEl.append(ambientFooter);
}

function renderWidget(widgetId, context) {
  const widget = WIDGETS[widgetId];
  if (!widget) {
    pushDevLog('warn', `Unknown widget: ${widgetId}`);
    return null;
  }
  return widget(context);
}

const WIDGETS = {
  kitchenHeader: (context) => buildKitchenTodayCard(context),
  today: (context) => buildCard('Today', '', renderTaskList(context.digest.todayTasks, 'No tasks visible.', { showPills: true }), 'panel-card panel-today-card'),
  spotlight: (context) => buildCard('Best Next Move', 'Most useful thing to do next', renderSpotlightCard(context.digest.spotlightTask)),
  signals: (context) => buildCard('Needs Attention', `${context.signals.length} visible`, renderSignalActionList(context.signals.slice(0, 6), 'Everything looks calm right now.'), 'panel-card panel-signals-card'),
  upcoming: (context) => buildCard('Coming Up', `${context.digest.upcomingTasks.length} coming soon`, renderTaskList(context.digest.upcomingTasks.slice(0, 6), 'Nothing is queued up soon.', { showPills: true }), 'panel-card panel-upcoming-card'),
  quickActions: () => buildQuickActionsCard(),
  forget: (context) => buildCard('Don’t Forget', 'Coming up soon', renderTaskList(context.forgetItems, 'Nothing important is coming up yet.', { showPills: true }), 'panel-card panel-reminders-card'),
  context: () => buildCard('Weather & Next Event', 'Context for the day', renderContextStack()),
  taskMapping: () => buildCard('Task Mapping', 'Live field mapping for this board', renderTaskMappingSummary()),
  tvHero: () => buildTvHero(),
  tvToday: (context) => buildCard(context.isEvening ? 'Today + Tomorrow' : 'Today', context.isEvening ? 'Evening preview is starting to fold in tomorrow' : '', renderTaskList(buildTvTodayItems(context), 'Nothing major on the board.', { compact: true, showPills: true }), 'tv-card tv-tall-card panel-card panel-today-card'),
  tvSignals: (context) => buildCard('Attention', '', renderList(context.signals.slice(0, 4).map(signalToItem), 'House is in a good place.'), 'tv-card tv-tall-card panel-card panel-signals-card'),
  tvMotion: (context) => buildCard('In Motion', context.digest.counts.inMotion ? `${context.digest.counts.inMotion} active` : '', renderTaskList(context.digest.inMotionTasks.slice(0, 5), 'Nothing is actively in motion right now.', { compact: true, showPills: true }), 'tv-card tv-tall-card panel-card panel-focus-card'),
  tvForget: (context) => buildCard('Don’t Forget', 'Tomorrow and coming up soon', renderTaskList(context.forgetItems.slice(0, 4), 'Nothing important is coming up soon.', { compact: true, showPills: true }), 'tv-card tv-bottom-card panel-card panel-reminders-card'),
  laundrySummary: () => buildCard('Laundry Status', 'Tap a load to move it forward', renderLaundrySummary(), 'laundry-summary-card'),
  laundryLoads: () => buildCard('Loads In Progress', 'Washer, dryer, and ready-to-fold loads', renderLaundryLoads(), 'laundry-loads-card'),
  laundrySignals: () => buildCard('Laundry Signals', 'Useful reminders for the workflow', renderLaundrySignals(), 'laundry-signals-card'),
  bedroomPrimary: (context) => buildCard(context.isEvening ? 'Tomorrow' : 'Today', describeDateContext(context), renderTaskList(buildBedroomPrimaryItems(context), `Nothing big for ${(context.isEvening ? 'tomorrow' : 'today')} yet.`, { showPills: true }), 'panel-card panel-today-card'),
  bedroomLaundry: () => buildCard('Laundry', 'Quickly move loads forward', renderBedroomLaundry(), 'bedroom-laundry-card'),
  bedroomForget: (context) => buildCard('Don’t Forget', 'Coming up soon', renderTaskList(context.forgetItems, 'No key reminders right now.', { showPills: true }), 'panel-card panel-reminders-card'),
  recentLogs: () => buildCard('Recent Logs', '', renderList(appState.logs.map(logToItem), 'No quick logs yet.')),
};


const MOBILE_TABS = {
  status: { label: 'Status', subtitle: (context) => 'Whole-house summary', render: (context) => renderMobileStatus(context) },
  logs: { label: 'Logs', subtitle: () => 'Recent actions and links', render: () => renderMobileLogs() },
  calendar: { label: 'Calendar', subtitle: () => `${appState.calendarAccounts.length} connected account${appState.calendarAccounts.length === 1 ? '' : 's'}`, render: () => renderMobileCalendar() },
  weather: { label: 'Weather', subtitle: () => appState.config.weatherLocationName || appState.config.weatherLocationQuery || 'Weather configuration', render: () => renderMobileWeather() },
  signals: { label: 'Signals', subtitle: () => 'Household reminder rules and previews', render: () => renderMobileSignals() },
  debug: { subtitle: () => appState.testTimeOverride ? `Test time active · ${new Date(appState.testTimeOverride).toLocaleString()}` : 'Diagnostics and test controls', label: 'Debug', render: () => renderMobileDebug() },
};

function getMobileTabDefinition(tabKey) {
  return MOBILE_TABS[tabKey] || MOBILE_TABS.status;
}

function getMobileTabs() {
  return Object.entries(MOBILE_TABS);
}

function buildMobileStack() {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-stack';
  return wrap;
}

function buildEmptyState(message, extraClass = '') {
  const empty = document.createElement('div');
  empty.className = `empty-state ${extraClass}`.trim();
  empty.textContent = message;
  return empty;
}

function buildPill(text, extraClass = '') {
  const pill = document.createElement('span');
  pill.className = `pill ${extraClass}`.trim();
  pill.textContent = text;
  return pill;
}

function buildListItem(item, options = {}) {
  const rowTag = options.tagName || 'div';
  const row = document.createElement(rowTag);
  row.className = options.rowClassName || 'list-item';
  if (item?.rowClass) row.classList.add(...String(item.rowClass).split(/\s+/).filter(Boolean));
  if (item?.ownerKey) {
    row.dataset.owner = item.ownerKey;
    row.classList.add(`owner-${item.ownerKey}`);
  }
  if (item?.emphasis) row.dataset.emphasis = item.emphasis;

  const left = document.createElement('div');
  left.className = options.leftClassName || 'list-item-left';
  const title = document.createElement('div');
  title.className = options.titleClassName || 'list-item-title';
  title.textContent = item.title || '';
  left.append(title);

  const metaText = item.meta || '';
  if (metaText || options.showMeta !== false) {
    const meta = document.createElement('div');
    meta.className = options.metaClassName || 'list-item-meta';
    meta.textContent = metaText;
    left.append(meta);
  }

  row.append(left);
  if (options.showPills && item.pill) {
    row.append(buildPill(item.pill, item.pillClass || ''));
  }

  if (typeof options.onActivate === 'function') {
    row.classList.add('list-item-interactive');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.style.cursor = 'pointer';
    if (item.actionHint) row.title = item.actionHint;
    row.addEventListener('click', (event) => {
      event.preventDefault();
      options.onActivate(event);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        options.onActivate(event);
      }
    });
  }

  return row;
}

function buildCardSectionHeader(titleText, subtitleText = '') {
  const wrap = document.createElement('div');
  wrap.className = 'card-header';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'card-title-wrap';
  const title = document.createElement('h2');
  title.textContent = titleText;
  const subtitle = document.createElement('span');
  subtitle.className = 'card-subtitle';
  subtitle.textContent = subtitleText || '';
  titleWrap.append(title, subtitle);
  wrap.append(titleWrap);
  return wrap;
}

function appendCards(container, cards) {
  for (const card of cards) {
    if (card) container.append(card);
  }
  return container;
}

function renderMobileControlPanel(context) {
  screenEl.className = 'screen single-column mobile-control-screen';
  screenEl.replaceChildren();

  const tabs = getMobileTabs();
  const activeTab = getMobileTabDefinition(appState.mobileTab);

  const nav = document.createElement('div');
  nav.className = 'mobile-tabs';
  for (const [key, def] of tabs) {
    const label = def.label;
    const btn = document.createElement('button');
    btn.className = `mobile-tab-button ${appState.mobileTab === key ? 'active' : ''}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', () => {
      appState.mobileTab = key;
      renderMode();
    });
    nav.append(btn);
  }
  screenEl.append(nav);

  const panel = document.createElement('section');
  panel.className = 'card mobile-panel';
  const body = document.createElement('div');
  body.className = 'card-body';

  panel.append(buildCardSectionHeader(activeTab.label, activeTab.subtitle(context)));

  let content;
  try {
    content = activeTab.render(context);
  } catch (error) {
    handleRuntimeActionError(`Could not render ${appState.mobileTab} tab`, error);
    content = renderInlineErrorCard(`The ${appState.mobileTab} tab hit an error.`, error);
  }
  body.append(content);
  panel.append(body);
  screenEl.append(panel);
}


function summarizeCalendarConnectionState() {
  const service = getCalendarServiceState();
  return {
    total: service.total,
    connected: service.connected,
    needsReconnect: service.needsReconnect,
    details: service.details,
    hasProblem: service.hasProblem,
  };
}

function buildCalendarConnectionItems() {
  return getCalendarServiceState().items;
}

function updateCalendarAuthBanner() {
  const el = document.getElementById('calendar-auth-banner');
  if (!el) return;
  const isMobileMode = (appState?.config?.mode || '') === 'mobile';
  if (!isMobileMode) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const service = getCalendarServiceState();
  if (!service.total) {
    el.innerHTML = '<div class="auth-banner auth-banner-warn"><strong>Calendar not connected.</strong> Use Mobile → Calendar to connect this device.</div>';
    el.style.display = 'block';
    return;
  }
  if (service.needsReconnect > 0) {
    el.innerHTML = `<div class="auth-banner auth-banner-warn"><strong>Calendar needs reconnect on this device.</strong> ${service.needsReconnect} account(s) need sign-in again. Open Mobile → Calendar and reconnect.</div>`;
    el.style.display = 'block';
    return;
  }
  el.style.display = 'none';
  el.innerHTML = '';
}

function renderMobileStatus(context) {
  const events = buildBedroomPrimaryItems({ ...context, isEvening: false }).filter((item) => item.pill === 'Calendar').slice(0, 3);
  return appendCards(buildMobileStack(), [
    buildCard('Active Signals', `${context.signals.length} visible`, renderList(context.signals.slice(0, 6).map(signalToItem), 'Everything looks calm right now.')),
    buildCard('Calendar Connection', 'Publisher device auth state', renderTaskList(buildCalendarConnectionItems(), 'No calendar accounts required yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Data Freshness', 'At-a-glance trust for live data', renderTaskList(getDataFreshnessItems(), 'Freshness diagnostics are not available yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Snapshot Freshness', 'Weather and calendar trust signals', renderTaskList(buildSnapshotStatusItems(), 'No shared snapshots available yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Shared Household Sync', 'Last shared config updates', renderTaskList(buildSharedSyncItems(), 'Shared household config has not been pushed yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Publisher Health', 'Snapshot publishing and housekeeping traces', renderTaskList(buildPublisherHealthItems(), 'Publisher diagnostics have not been recorded yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Housekeeping Results', 'Per-table prune outcomes and retention windows', renderTaskList(buildHousekeepingResultItems(), 'No housekeeping results recorded on this device yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Degraded State', 'What the ambient screens would tell you right now', renderTaskList((() => {
      const health = getAmbientHealthState();
      return [
        {
          title: health.title,
          meta: health.message,
          pill: health.level === 'degraded' ? 'Degraded' : (health.level === 'aging' ? 'Aging' : 'Healthy'),
          pillClass: health.level === 'degraded' ? 'warning' : '',
        },
        ...health.issues.slice(0, 3).map((issue) => ({
          title: issue.title,
          meta: issue.meta || '',
          pill: issue.level === 'degraded' ? 'Needs attention' : 'Watch',
          pillClass: issue.level === 'degraded' ? 'warning' : '',
        })),
      ];
    })(), 'Ambient degraded-state diagnostics are not available yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Client Version', 'App and service worker alignment', renderTaskList(buildServiceWorkerStatusItems(), 'Service worker diagnostics are not available yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Screen Awake', 'Local device display power', renderTaskList(buildWakeLockStatusItems(), 'No wake-lock status available yet.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Laundry Snapshot', 'Current workflow', renderLaundrySummary(), 'mobile-compact-card'),
    buildCard('Next Events', 'Merged calendar feed', renderTaskList(events, 'No upcoming events right now.', { showPills: true }), 'mobile-compact-card'),
    buildCard('Weather', 'Current household weather', renderContextStack(), 'mobile-compact-card'),
    buildCard('System Health', 'Quick service check', renderConnectionStatusPanel(), 'mobile-compact-card'),
  ]);
}

function buildSecondaryButton(label, onClick) {
  const button = document.createElement('button');
  button.className = 'secondary-button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function buildLinkButton(label, href) {
  const link = document.createElement('a');
  link.className = 'secondary-button mobile-link-button';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = label;
  return link;
}

function buildInlineActions(items) {
  const actions = document.createElement('div');
  actions.className = 'mobile-inline-actions';
  actions.append(...items);
  return actions;
}

function renderMobileLogs() {
  const wrap = buildMobileStack();
  wrap.append(buildInlineActions([
    buildLinkButton('Open Supabase project', 'https://supabase.com/dashboard/project/pssgbrtyhwoumhiynwlj'),
  ]));
  wrap.append(renderList(appState.logs.slice(0, 30).map(logToItem), 'No recent logs yet.'));
  return wrap;
}

function renderMobileCalendar() {
  const wrap = buildMobileStack();
  const calendarService = getCalendarServiceState();
  wrap.append(buildInlineActions([
    buildSecondaryButton('Add Google account', () => connectGoogleAccountButton?.click()),
    buildSecondaryButton('Push calendar config', async () => {
      try {
        await pushSharedCalendarConfig();
      } catch (error) {
        handleRuntimeActionError('Calendar push failed', error);
        showToast('Could not push calendar config', 'error');
      }
    }),
    buildSecondaryButton('Open Settings', () => settingsButton?.click()),
  ]));
  const headlessNote = document.createElement('div');
  headlessNote.className = 'muted';
  headlessNote.textContent = calendarService.publisher
    ? `Headless mode: a connected device publishes merged calendar snapshots for shared displays. Current publisher: ${calendarService.publisher}.`
    : 'Headless mode: a connected device publishes merged calendar snapshots for shared displays.';
  wrap.append(headlessNote);
  wrap.append(buildCard('This Device’s Calendar Connection', 'Local Google auth status for publishing', renderTaskList(calendarService.items, 'No calendar accounts required yet.', { showPills: true }), 'mobile-compact-card'));
  const accounts = document.createElement('div');
  accounts.className = 'mobile-accounts-copy';
  accounts.append(renderCalendarAccountsPanel({ editable: false }));
  wrap.append(accounts);
  return wrap;
}

function renderMobileWeather() {
  const wrap = buildMobileStack();
  const weatherService = getWeatherServiceState();
  wrap.append(buildInlineActions([
    buildSecondaryButton('Refresh weather', () => refreshWeatherOnly()),
    buildSecondaryButton('Push weather config', async () => {
      try {
        await pushSharedWeatherConfig();
        await fetchHouseholdConfig();
        await refreshWeatherOnly();
      } catch (error) {
        handleRuntimeActionError('Weather push failed', error);
        showToast('Could not push weather config', 'error');
      }
    }),
    buildSecondaryButton('Edit weather settings', () => settingsButton?.click()),
  ]));
  wrap.append(buildCard('Current Weather', weatherService.locationLabel, renderTaskList(weatherService.items, 'Weather not connected yet.', { showPills: true }), 'mobile-compact-card'));
  return wrap;
}



function renderSignalRulesPreview(rules) {
  const previewItems = [
    ...buildSyntheticLaundrySignals(rules),
    ...buildSyntheticRuleSignals(rules),
    ...buildSyntheticCustomSignals(rules),
  ].slice(0, 8).map(signalToItem);
  return renderTaskList(previewItems, 'No synthetic signals would be visible right now for these settings.', { showPills: true });
}


function renderMobileSignals() {
  const wrap = buildMobileStack();
  wrap.append(buildInlineActions([
    buildSecondaryButton('Push signal config', async () => {
      try {
        await pushSharedSignalConfig();
        await fetchHouseholdConfig();
        renderRuntimeUi({ renderDevConsole: false });
      } catch (error) {
        handleRuntimeActionError('Signal config push failed', error);
        showToast('Could not push signal config', 'error');
      }
    }),
    buildSecondaryButton('Use household config', () => {
      setSignalRulesDraft(appState.sharedConfig[SHARED_CONFIG_KEYS.signalRules] || DEFAULT_SIGNAL_RULES);
      showToast('Loaded household signal config', 'success');
      renderRuntimeUi({ renderDevConsole: false });
    }),
    buildSecondaryButton('Reset defaults', () => {
      setSignalRulesDraft(DEFAULT_SIGNAL_RULES);
      showToast('Reset local signal draft', 'success');
      renderRuntimeUi({ renderDevConsole: false });
    }),
    buildSecondaryButton('Add custom signal', () => openSignalRuleModal('custom', { mode: 'edit', isNew: true })),
  ]));

  const note = document.createElement('div');
  note.className = 'muted';
  note.textContent = 'Signal rules now use compact cards for browsing. Tap any card to view details or edit it in a modal.';
  wrap.append(note);

  const rules = normalizeSignalRules(appState.signalRulesDraft || appState.sharedConfig[SHARED_CONFIG_KEYS.signalRules] || DEFAULT_SIGNAL_RULES);

  wrap.append(buildCard('Core signals', 'Tap a card to view or edit the household defaults', renderSignalRuleSummaryList([
    buildCoreSignalSummaryItem('bins', rules),
    buildCoreSignalSummaryItem('tomorrowEvent', rules),
    buildCoreSignalSummaryItem('laundry', rules),
  ]), 'mobile-compact-card'));

  wrap.append(buildCard('Custom signal rules', `${rules.custom.length} configured`, renderSignalRuleSummaryList(
    rules.custom.map((rule, index) => buildCustomSignalSummaryItem(rule, index))
  , 'No custom signal rules yet.'), 'mobile-compact-card'));

  wrap.append(buildCard('Signal preview', 'Uses the current local draft and current time override', renderSignalRulesPreview(rules), 'mobile-compact-card'));
  return wrap;
}

function buildCoreSignalSummaryItem(key, rules) {
  if (key === 'bins') {
    return {
      kind: 'bins',
      title: 'Bins reminder',
      summary: summarizeBinsRule(rules.bins),
      detail: rules.bins.enabled ? 'Shared weekly reminder' : 'Currently disabled',
      enabled: !!rules.bins.enabled,
    };
  }
  if (key === 'tomorrowEvent') {
    return {
      kind: 'tomorrowEvent',
      title: 'Tomorrow event signal',
      summary: summarizeTomorrowEventRule(rules.tomorrowEvent),
      detail: rules.tomorrowEvent.enabled ? 'Calendar-driven evening prompt' : 'Currently disabled',
      enabled: !!rules.tomorrowEvent.enabled,
    };
  }
  return {
    kind: 'laundry',
    title: 'Laundry attention',
    summary: summarizeLaundryRule(rules.laundry),
    detail: rules.laundry.enabled ? 'Shows active laundry state as attention' : 'Currently disabled',
    enabled: !!rules.laundry.enabled,
  };
}

function buildCustomSignalSummaryItem(rule, index) {
  const normalized = normalizeCustomSignalRule(rule);
  const detailBits = [];
  if (normalized.clearMode === 'log_event_today' && normalized.ackEventType) detailBits.push(`Clears on ${normalized.ackEventType}`);
  if (normalized.location) detailBits.push(normalized.location);
  return {
    kind: 'custom',
    id: normalized.id,
    title: normalized.name || `Custom signal ${index + 1}`,
    summary: summarizeCustomSignalRule(normalized),
    detail: detailBits.join(' · ') || (normalized.enabled ? 'Custom household reminder' : 'Currently disabled'),
    enabled: !!normalized.enabled,
  };
}

function summarizeBinsRule(rule) {
  const dayLabel = DAY_OPTIONS.find(([value]) => Number(value) === Number(rule?.dayOfWeek))?.[1] || 'Weekly';
  const statusLabel = rule?.enabled ? `${dayLabel} · ${formatHourLabel(rule.startHour)} start · warn ${formatHourLabel(rule.escalateHour)}` : 'Disabled';
  return statusLabel;
}

function summarizeTomorrowEventRule(rule) {
  return rule?.enabled ? `After ${formatHourLabel(rule.startHour)} · big event tomorrow` : 'Disabled';
}

function summarizeLaundryRule(rule) {
  return rule?.enabled ? 'Active loads surface as attention' : 'Disabled';
}

function renderSignalRuleSummaryList(items, emptyText = 'No signal rules yet.') {
  const list = document.createElement('div');
  list.className = 'signal-rule-summary-list';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = emptyText;
    list.append(empty);
    return list;
  }
  items.forEach((item) => list.append(renderSignalSummaryCard(item)));
  return list;
}

function renderSignalSummaryCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `signal-summary-card ${item.enabled ? '' : 'is-disabled'}`.trim();
  card.addEventListener('click', () => openSignalRuleModal(item.kind, { mode: 'view', ruleId: item.id || null }));

  const top = document.createElement('div');
  top.className = 'signal-summary-top';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'signal-summary-copy';
  const title = document.createElement('div');
  title.className = 'signal-summary-title';
  title.textContent = item.title;
  const summary = document.createElement('div');
  summary.className = 'signal-summary-meta';
  summary.textContent = item.summary || '';
  titleWrap.append(title, summary);

  const badge = buildPill(item.enabled ? 'Enabled' : 'Disabled', item.enabled ? '' : 'muted-pill');
  top.append(titleWrap, badge);

  const detail = document.createElement('div');
  detail.className = 'signal-summary-detail';
  detail.textContent = item.detail || '';

  const actions = document.createElement('div');
  actions.className = 'signal-summary-actions';
  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'secondary-button small-button';
  viewBtn.textContent = 'View';
  viewBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openSignalRuleModal(item.kind, { mode: 'view', ruleId: item.id || null });
  });
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary-button small-button';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openSignalRuleModal(item.kind, { mode: 'edit', ruleId: item.id || null });
  });
  actions.append(viewBtn, editBtn);

  card.append(top, detail, actions);
  return card;
}

function openSignalRuleModal(kind, options = {}) {
  const rules = normalizeSignalRules(appState.signalRulesDraft || appState.sharedConfig[SHARED_CONFIG_KEYS.signalRules] || DEFAULT_SIGNAL_RULES);
  const modalState = buildSignalModalState(kind, rules, options);
  if (!modalState) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay signal-modal-overlay';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  const panel = document.createElement('div');
  panel.className = 'modal-panel signal-modal-panel';
  overlay.append(panel);
  document.body.append(overlay);

  const close = () => overlay.remove();
  const rerender = () => renderSignalRuleModalPanel(panel, modalState, rerender, close);
  rerender();
}

function buildSignalModalState(kind, rules, options = {}) {
  if (kind === 'custom') {
    const sourceRule = options.isNew
      ? normalizeCustomSignalRule({
          name: '',
          scheduleType: 'weekly',
          dayOfWeek: getNowDate().getDay(),
          startHour: Math.min(23, getNowDate().getHours()),
          clearMode: 'schedule_window',
          escalateToWarning: false,
        })
      : normalizeCustomSignalRule((rules.custom || []).find((rule) => rule.id === options.ruleId));
    if (!sourceRule) return null;
    return {
      kind,
      mode: options.mode || 'view',
      isNew: !!options.isNew,
      ruleId: sourceRule.id,
      draft: sourceRule,
    };
  }
  if (kind === 'bins') {
    return { kind, mode: options.mode || 'view', draft: { ...rules.bins } };
  }
  if (kind === 'tomorrowEvent') {
    return { kind, mode: options.mode || 'view', draft: { ...rules.tomorrowEvent } };
  }
  if (kind === 'laundry') {
    return { kind, mode: options.mode || 'view', draft: { ...rules.laundry } };
  }
  return null;
}

function renderSignalRuleModalPanel(panel, modalState, rerender, close) {
  panel.replaceChildren();

  const header = document.createElement('div');
  header.className = 'signal-modal-header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'signal-modal-title';
  title.textContent = getSignalModalTitle(modalState);
  const subtitle = document.createElement('div');
  subtitle.className = 'signal-modal-subtitle';
  subtitle.textContent = getSignalModalSubtitle(modalState);
  titleWrap.append(title, subtitle);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'secondary-button small-button';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', close);
  header.append(titleWrap, closeBtn);
  panel.append(header);

  const body = document.createElement('div');
  body.className = 'mobile-stack';
  if (modalState.mode === 'view') {
    body.append(renderSignalRuleDetailView(modalState));
  } else {
    body.append(renderSignalRuleForm(modalState, rerender));
  }
  panel.append(body);

  const footer = document.createElement('div');
  footer.className = 'signal-modal-footer';

  if (modalState.mode === 'view') {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary-button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      modalState.mode = 'edit';
      rerender();
    });
    footer.append(editBtn);
  } else {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'secondary-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (modalState.isNew) {
        close();
      } else {
        modalState.mode = 'view';
        rerender();
      }
    });
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'secondary-button';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      if (!saveSignalModalDraft(modalState)) return;
      close();
      renderRuntimeUi({ renderDevConsole: false });
      showToast('Saved signal rule', 'success');
    });
    footer.append(cancelBtn, saveBtn);
    if (modalState.kind === 'custom' && !modalState.isNew) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'secondary-button danger-button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        deleteCustomSignalRule(modalState.ruleId);
        close();
        renderRuntimeUi({ renderDevConsole: false });
        showToast('Deleted custom signal', 'success');
      });
      footer.prepend(deleteBtn);
    }
  }
  panel.append(footer);
}

function getSignalModalTitle(modalState) {
  if (modalState.kind === 'bins') return 'Bins reminder';
  if (modalState.kind === 'tomorrowEvent') return 'Tomorrow event signal';
  if (modalState.kind === 'laundry') return 'Laundry attention';
  return modalState.draft.name || (modalState.isNew ? 'New custom signal' : 'Custom signal');
}

function getSignalModalSubtitle(modalState) {
  if (modalState.kind === 'bins') return summarizeBinsRule(modalState.draft);
  if (modalState.kind === 'tomorrowEvent') return summarizeTomorrowEventRule(modalState.draft);
  if (modalState.kind === 'laundry') return summarizeLaundryRule(modalState.draft);
  return summarizeCustomSignalRule(modalState.draft);
}

function renderSignalRuleDetailView(modalState) {
  const rows = [];
  if (modalState.kind === 'bins') {
    rows.push(['Status', modalState.draft.enabled ? 'Enabled' : 'Disabled']);
    rows.push(['Day', DAY_OPTIONS.find(([value]) => Number(value) === Number(modalState.draft.dayOfWeek))?.[1] || 'Weekly']);
    rows.push(['Starts', formatHourLabel(modalState.draft.startHour)]);
    rows.push(['Warning', formatHourLabel(modalState.draft.escalateHour)]);
    rows.push(['Location', modalState.draft.location || 'outside']);
  } else if (modalState.kind === 'tomorrowEvent') {
    rows.push(['Status', modalState.draft.enabled ? 'Enabled' : 'Disabled']);
    rows.push(['Starts after', formatHourLabel(modalState.draft.startHour)]);
    rows.push(['Minimum events', String(modalState.draft.minEvents || 1)]);
  } else if (modalState.kind === 'laundry') {
    rows.push(['Status', modalState.draft.enabled ? 'Enabled' : 'Disabled']);
    rows.push(['Behavior', 'Surfaces active laundry as an attention signal']);
  } else {
    const rule = normalizeCustomSignalRule(modalState.draft);
    rows.push(['Status', rule.enabled ? 'Enabled' : 'Disabled']);
    rows.push(['Schedule', rule.scheduleType === 'daily' ? 'Daily' : DAY_OPTIONS.find(([value]) => Number(value) === rule.dayOfWeek)?.[1] || 'Weekly']);
    rows.push(['Start', formatHourLabel(rule.startHour)]);
    rows.push(['End', rule.endHour === null ? 'Until end of day' : formatHourLabel(rule.endHour)]);
    rows.push(['Clear rule', rule.clearMode === 'log_event_today' ? 'Clear when matching log appears today' : 'Hide outside schedule window']);
    if (rule.clearMode === 'log_event_today') rows.push(['Log key', rule.ackEventType || '—']);
    rows.push(['Warning', rule.escalateToWarning ? `At ${formatHourLabel(rule.escalateHour)}` : 'No warning escalation']);
    rows.push(['Location', rule.location || '—']);
  }

  const wrap = document.createElement('div');
  wrap.className = 'signal-detail-list';
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'meta-row';
    const left = document.createElement('div');
    left.textContent = label;
    const right = document.createElement('div');
    right.className = 'signal-detail-value';
    right.textContent = value;
    row.append(left, right);
    wrap.append(row);
  });
  return wrap;
}

function renderSignalRuleForm(modalState, rerender) {
  const body = document.createElement('div');
  body.className = 'mobile-stack signal-modal-form';

  if (modalState.kind === 'bins') {
    body.append(makeCheckboxRow('Enable bins reminder', modalState.draft.enabled, (checked) => { modalState.draft.enabled = checked; }));
    body.append(makeSelectField('Reminder day', DAY_OPTIONS, String(modalState.draft.dayOfWeek), (value) => { modalState.draft.dayOfWeek = Number(value); rerender(); }));
    body.append(makeHourField('Start showing', modalState.draft.startHour, (value) => { modalState.draft.startHour = Number(value); modalState.draft.escalateHour = Math.max(modalState.draft.startHour, modalState.draft.escalateHour); rerender(); }));
    body.append(makeHourField('Escalate to warning', modalState.draft.escalateHour, (value) => { modalState.draft.escalateHour = Number(value); rerender(); }));
    body.append(makeTextField('Location label', modalState.draft.location || '', (value) => { modalState.draft.location = value; }, 'outside'));
    return body;
  }

  if (modalState.kind === 'tomorrowEvent') {
    body.append(makeCheckboxRow('Enable big event tomorrow signal', modalState.draft.enabled, (checked) => { modalState.draft.enabled = checked; }));
    body.append(makeHourField('Start showing after', modalState.draft.startHour, (value) => { modalState.draft.startHour = Number(value); rerender(); }));
    return body;
  }

  if (modalState.kind === 'laundry') {
    body.append(makeCheckboxRow('Enable laundry attention signal', modalState.draft.enabled, (checked) => { modalState.draft.enabled = checked; }));
    return body;
  }

  body.append(makeCheckboxRow('Enabled', modalState.draft.enabled, (checked) => { modalState.draft.enabled = checked; }));
  body.append(makeTextField('Signal name', modalState.draft.name, (value) => { modalState.draft.name = value; }, 'Bins out tonight', () => rerender()));
  body.append(makeSelectField('Schedule rule', CUSTOM_SIGNAL_SCHEDULE_OPTIONS, modalState.draft.scheduleType, (value) => { modalState.draft.scheduleType = value; rerender(); }));
  if (modalState.draft.scheduleType === 'weekly') {
    body.append(makeSelectField('Day', DAY_OPTIONS, String(modalState.draft.dayOfWeek), (value) => { modalState.draft.dayOfWeek = Number(value); rerender(); }));
  }
  body.append(makeHourField('Start showing', modalState.draft.startHour, (value) => {
    modalState.draft.startHour = Number(value);
    modalState.draft.escalateHour = Math.max(modalState.draft.startHour, modalState.draft.escalateHour || modalState.draft.startHour);
    rerender();
  }));
  body.append(makeOptionalHourField('End showing (optional)', modalState.draft.endHour, (value) => { modalState.draft.endHour = value === '' ? null : Number(value); rerender(); }));
  body.append(makeSelectField('Clear / acknowledge', CUSTOM_SIGNAL_CLEAR_OPTIONS, modalState.draft.clearMode, (value) => { modalState.draft.clearMode = value; rerender(); }));
  if (modalState.draft.clearMode === 'log_event_today') {
    body.append(makeTextField('Household log event key', modalState.draft.ackEventType, (value) => { modalState.draft.ackEventType = value; }, 'bins_out'));
  }
  body.append(makeCheckboxRow('Escalate to warning later', modalState.draft.escalateToWarning, (checked) => { modalState.draft.escalateToWarning = checked; rerender(); }));
  if (modalState.draft.escalateToWarning) {
    body.append(makeHourField('Escalate to warning at', modalState.draft.escalateHour, (value) => { modalState.draft.escalateHour = Number(value); rerender(); }));
  }
  body.append(makeTextField('Location label (optional)', modalState.draft.location || '', (value) => { modalState.draft.location = value; }, 'outside'));
  return body;
}

function saveSignalModalDraft(modalState) {
  const next = normalizeSignalRules(appState.signalRulesDraft || DEFAULT_SIGNAL_RULES);
  if (modalState.kind === 'bins') {
    next.bins = {
      enabled: !!modalState.draft.enabled,
      dayOfWeek: Number(modalState.draft.dayOfWeek),
      startHour: clampHour(modalState.draft.startHour, next.bins.startHour),
      escalateHour: Math.max(clampHour(modalState.draft.startHour, next.bins.startHour), clampHour(modalState.draft.escalateHour, next.bins.escalateHour)),
      location: String(modalState.draft.location || 'outside').trim() || 'outside',
    };
  } else if (modalState.kind === 'tomorrowEvent') {
    next.tomorrowEvent = {
      ...next.tomorrowEvent,
      enabled: !!modalState.draft.enabled,
      startHour: clampHour(modalState.draft.startHour, next.tomorrowEvent.startHour),
    };
  } else if (modalState.kind === 'laundry') {
    next.laundry = { enabled: !!modalState.draft.enabled };
  } else {
    const normalized = normalizeCustomSignalRule(modalState.draft);
    if (!normalized.name) {
      showToast('Signal name is required', 'error');
      return false;
    }
    if (modalState.isNew) {
      next.custom.push(normalized);
    } else {
      next.custom = next.custom.map((item) => item.id === modalState.ruleId ? normalized : item);
    }
  }
  setSignalRulesDraft(next);
  return true;
}

function deleteCustomSignalRule(ruleId) {
  const next = normalizeSignalRules(appState.signalRulesDraft || DEFAULT_SIGNAL_RULES);
  next.custom = next.custom.filter((item) => item.id !== ruleId);
  setSignalRulesDraft(next);
  return true;
}

function makeCheckboxRow(label, checked, onChange) {
  const row = document.createElement('label');
  row.className = 'checkbox-row mobile-checkbox-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(!!input.checked));
  const text = document.createElement('span');
  text.textContent = label;
  row.append(input, text);
  return row;
}

function makeTextField(label, value, onChange, placeholder = '', onCommit = null) {
  const wrap = document.createElement('label');
  wrap.className = 'mobile-field-stack';
  const title = document.createElement('span');
  title.className = 'muted';
  title.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => onChange(input.value));
  input.addEventListener('blur', () => {
    if (typeof onCommit === 'function') onCommit(input.value);
  });
  wrap.append(title, input);
  return wrap;
}

function renderInlineErrorCard(message, error) {
  const card = document.createElement('section');
  card.className = 'inline-error-card';

  const title = document.createElement('div');
  title.className = 'inline-error-title';
  title.textContent = message;

  const detail = document.createElement('div');
  detail.className = 'inline-error-detail';
  detail.textContent = error?.message || String(error || 'Unknown error');

  const hint = document.createElement('div');
  hint.className = 'muted';
  hint.textContent = 'The rest of the app is still running. Open the dev console for details or refresh after updating the patch.';

  card.append(title, detail, hint);
  return card;
}

function makeSelectField(label, options, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'mobile-field-stack';
  const title = document.createElement('span');
  title.className = 'muted';
  title.textContent = label;
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    if (String(optionValue) === String(value)) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(title, select);
  return wrap;
}

function makeHourField(label, value, onChange) {
  const options = Array.from({ length: 24 }, (_, hour) => [String(hour), formatHourLabel(hour)]);
  return makeSelectField(label, options, String(value), onChange);
}

function makeOptionalHourField(label, value, onChange) {
  const options = [['', 'No end time'], ...Array.from({ length: 24 }, (_, hour) => [String(hour), formatHourLabel(hour)])];
  return makeSelectField(label, options, value === null || value === undefined ? '' : String(value), onChange);
}

function renderMobileDebug() {
  const wrap = buildMobileStack();
  wrap.append(buildInlineActions([
    buildSecondaryButton('Open dev console', () => { devConsoleEl.classList.remove('hidden'); renderDevConsole(); }),
    buildSecondaryButton('Force refresh', () => refreshAll('debug force refresh')),
  ]));
  const realtimeDiag = appState.realtimeDiagnostics || {};
  wrap.append(buildCard('Diagnostics', 'Current runtime state', renderTaskList([
    { title: `Mode: ${appState.config.mode}`, meta: `Device ${appState.config.deviceName || 'Unnamed'}`, pill: 'Config' },
    { title: `Test time: ${appState.testTimeOverride ? new Date(appState.testTimeOverride).toLocaleString() : 'Real time'}`, meta: `Status ${statusLine.textContent || ''}`, pill: 'Time' },
    { title: `Snapshots: ${Object.keys(appState.snapshots || {}).length}`, meta: `Tasks ${appState.tasks.length} · Signals ${activeSignals().length} · Loads ${appState.loads.length}`, pill: 'State' },
    { title: `Calendar fetch: ${appState.calendarDiagnostics.fetchedEvents} fetched · ${appState.calendarDiagnostics.mergedToday + appState.calendarDiagnostics.mergedTomorrow} merged`, meta: `Selected ${appState.calendarDiagnostics.selectedSources} · Expired ${appState.calendarDiagnostics.expiredAccounts}${appState.calendarDiagnostics.lastError ? ` · ${appState.calendarDiagnostics.lastError}` : ''}`, pill: 'Calendar' },
    { title: `Calendar publisher: ${(appState.calendarPublisherDiagnostics || {}).lastPublishStatus || 'idle'}`, meta: `${(appState.calendarPublisherDiagnostics || {}).lastAttemptReason || 'No recent attempt'}${(appState.calendarPublisherDiagnostics || {}).lastSkipReason ? ` · ${(appState.calendarPublisherDiagnostics || {}).lastSkipReason}` : ''}${(appState.calendarPublisherDiagnostics || {}).lastPublishError ? ` · ${(appState.calendarPublisherDiagnostics || {}).lastPublishError}` : ''}`, pill: 'Publisher' },
    { title: `Realtime: ${realtimeDiag.activeChannels || 0} channels · ${realtimeDiag.lastStatus || 'idle'}`, meta: `${realtimeDiag.lastEventTable ? `Last ${realtimeDiag.lastEventTable}` : 'No recent events'}${realtimeDiag.lastEventAt ? ` · ${new Date(realtimeDiag.lastEventAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`, pill: 'Realtime' },
    buildServiceWorkerDebugSummary(),
    buildWakeLockDebugSummary(),
  ], 'No diagnostics yet.', { showPills: true }), 'mobile-compact-card'));
  return wrap;
}

function buildTvHero() {
  const section = document.createElement('section');
  section.className = 'card tv-card tv-hero';
  const weather = getSnapshot(appState.config.weatherSnapshotType);
  const todayCal = getSnapshot(appState.config.calendarTodaySnapshotType);
  const nextEvent = Array.isArray(todayCal?.payload?.items) ? todayCal.payload.items[0] : null;

  const topRow = document.createElement('div');
  topRow.className = 'tv-hero-top';

  const date = document.createElement('div');
  date.className = 'tv-date';
  date.textContent = getNowDate().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const topRight = document.createElement('div');
  topRight.className = 'tv-hero-right';

  if (trustIndicator) {
    const headerTrust = trustIndicator.cloneNode(true);
    headerTrust.id = '';
    headerTrust.classList.add('tv-header-trust');
    headerTrust.onclick = () => trustIndicator.click();
    topRight.append(headerTrust);
  }

  const timeEl = document.createElement('div');
  timeEl.className = 'tv-clock';
  timeEl.textContent = getNowDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  topRight.append(timeEl);
  topRow.append(date, topRight);

  const contextRow = document.createElement('div');
  contextRow.className = 'tv-context-row';

  const weatherEl = document.createElement('div');
  weatherEl.className = 'tv-weather';
  weatherEl.textContent = weather?.payload ? formatWeatherSummary(weather.payload, { includeTomorrow: isEvening() }) : 'Weather snapshot not loaded yet';

  const nextEl = document.createElement('div');
  nextEl.className = 'tv-next';
  nextEl.textContent = nextEvent ? `Next: ${nextEvent.title}${nextEvent.time ? ` · ${nextEvent.time}` : ''}${nextEvent.sourceLabel ? ` · ${nextEvent.sourceLabel}` : ''}` : 'Nothing urgent on the calendar';

  contextRow.append(weatherEl, nextEl);

  const freshnessEl = document.createElement('div');
  freshnessEl.className = 'muted tv-freshness';
  const publisher = describeSnapshotPublisher(todayCal);
  const freshnessItems = getDataFreshnessItems();
  const ambientHealth = getAmbientHealthState();
  const taskFreshness = freshnessItems.find((item) => item.title === 'Tasks');
  const configFreshness = freshnessItems.find((item) => item.title === 'Shared config');
  freshnessEl.textContent = [
    ambientHealth && ambientHealth.level !== 'ok' ? `Health · ${ambientHealth.level === 'degraded' ? 'Degraded' : 'Aging'}` : null,
    weather ? snapshotMetaLabel('Weather', weather) : null,
    todayCal ? snapshotMetaLabel('Calendar', todayCal) : null,
    publisher ? `Publisher · ${publisher}` : null,
    taskFreshness ? `Tasks · ${taskFreshness.pill}` : null,
    configFreshness ? `Config · ${configFreshness.pill}` : null,
  ].filter(Boolean).join(' · ') || 'Snapshots will show here once loaded';

  section.append(topRow, contextRow, freshnessEl);
  return section;
}


function buildTvTodayItems(context) {
  const todaySnapshot = getSnapshotPayload(appState.config.calendarTodaySnapshotType);
  const eventItems = Array.isArray(todaySnapshot?.items)
    ? todaySnapshot.items.slice(0, 3).map((item) => ({
        title: item.title,
        meta: [item.sourceLabel || 'Calendar', item.time].filter(Boolean).join(' · '),
        pill: 'Calendar',
      }))
    : [];

  const taskItems = context.digest.todayTasks.slice(0, context.isEvening ? 2 : 3);
  const overdueItems = context.digest.overdueTasks.slice(0, 1);
  const baseItems = blendTaskAndEventItems(taskItems, eventItems, overdueItems, context.isEvening ? 4 : 6);

  if (!context.isEvening) return baseItems;

  const tomorrowPreview = context.digest.tomorrowTasks.slice(0, 2).map((item) => ({
    ...item,
    pill: item.pill || 'Tomorrow',
    meta: item.meta ? `${item.meta}` : 'Tomorrow',
  }));

  return [...baseItems, ...tomorrowPreview].slice(0, 6);
}

function buildBedroomPrimaryItems(context) {
  if (context.isEvening) {
    return context.tomorrowItems.slice(0, 6);
  }
  const todaySnapshot = getSnapshotPayload(appState.config.calendarTodaySnapshotType);
  const eventItems = Array.isArray(todaySnapshot?.items)
    ? todaySnapshot.items.slice(0, 3).map((item) => ({
        title: item.title,
        meta: [item.sourceLabel || 'Calendar', item.time].filter(Boolean).join(' · '),
        pill: 'Calendar',
      }))
    : [];
  const taskItems = context.digest.todayTasks.slice(0, 4);
  const overdueItems = context.digest.overdueTasks.slice(0, 1);
  return blendTaskAndEventItems(taskItems, eventItems, overdueItems, 6);
}



function buildSignalActionRow(signal) {
  const wrap = document.createElement('div');
  wrap.className = 'signal-action-row';

  const snoozeButton = document.createElement('button');
  snoozeButton.className = 'secondary-button signal-action-button';
  snoozeButton.type = 'button';
  snoozeButton.textContent = 'Snooze 2h';
  snoozeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    snoozeSignal(signal, 120);
  });
  wrap.append(snoozeButton);

  if (!signal?.metadata?.synthetic) {
    const dismissButton = document.createElement('button');
    dismissButton.className = 'secondary-button signal-action-button signal-dismiss-button';
    dismissButton.type = 'button';
    dismissButton.textContent = 'Dismiss';
    dismissButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dismissSignal(signal);
    });
    wrap.append(dismissButton);
  }

  return wrap;
}

function renderSignalActionList(signals, emptyText, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `list signal-action-list ${options.compact ? 'list-compact' : ''}`.trim();
  const items = Array.isArray(signals) ? signals : [];
  if (!items.length) {
    wrapper.append(buildEmptyState(emptyText));
    return wrapper;
  }
  for (const signal of items) {
    const item = signalToItem(signal);
    const row = buildListItem(item, { showPills: true, rowClassName: 'list-item signal-action-item' });
    row.append(buildSignalActionRow(signal));
    wrapper.append(row);
  }
  return wrapper;
}

function buildQuickActionsCard() {
  const wrap = document.createElement('div');
  wrap.className = 'quick-grid';
  for (const item of QUICK_LOGS) {
    const button = document.createElement('button');
    button.className = 'quick-button quick-button-blue';
    button.textContent = item.label;
    button.addEventListener('click', () => createQuickLog(item, button));
    wrap.append(button);
  }
  return buildCard('Quick Actions', 'One tap, then done', wrap, 'kitchen-quick-actions-card');
}


function loadStatusRank(status) {
  const order = { ready: 0, drying: 1, washing: 2, done: 3 };
  return order[status] ?? 9;
}

function loadNextStep(status) {
  if (status === 'washing') return 'Next: move to dryer';
  if (status === 'drying') return 'Next: mark ready for folding';
  if (status === 'ready') return 'Next: mark done';
  return 'Done';
}

function renderLaundrySummary() {
  const wrapper = document.createElement('div');
  wrapper.className = 'laundry-summary';

  const counts = { washing: 0, drying: 0, ready: 0 };
  for (const load of appState.loads) {
    if (load.archived_at || load.status === 'done') continue;
    if (counts[load.status] !== undefined) counts[load.status] += 1;
  }

  const addButton = document.createElement('button');
  addButton.className = 'primary-button laundry-start-button';
  addButton.textContent = 'Start new load';
  addButton.addEventListener('click', () => createLoad(addButton));
  wrapper.append(addButton);

  const grid = document.createElement('div');
  grid.className = 'laundry-summary-grid';
  const items = [
    ['Washing', counts.washing, 'washing'],
    ['Drying', counts.drying, 'drying'],
    ['Ready', counts.ready, 'ready'],
  ];
  for (const [label, value, status] of items) {
    const chip = document.createElement('div');
    chip.className = `laundry-stat status-${status}`;
    chip.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    grid.append(chip);
  }
  wrapper.append(grid);

  const hint = document.createElement('div');
  hint.className = 'laundry-tip muted';
  hint.textContent = counts.ready
    ? 'A load is ready and may need folding.'
    : 'Tap any load below to move it to the next step.';
  wrapper.append(hint);
  return wrapper;
}

function buildLaundrySignalItems() {
  const items = [];
  const now = getNowMs();
  const activeLoads = appState.loads.filter((load) => !load.archived_at && load.status !== 'done');
  const staleLoads = activeLoads.filter((load) => {
    const movedAt = new Date(load.last_transition_at || load.updated_at || load.created_at).getTime();
    return Number.isFinite(movedAt) && now - movedAt > 90 * 60 * 1000;
  }).sort((a, b) => new Date(a.last_transition_at || a.updated_at || a.created_at) - new Date(b.last_transition_at || b.updated_at || b.created_at));

  if (staleLoads.length) {
    const stale = staleLoads[0];
    items.push({
      title: `${stale.label || `Load ${stale.id.slice(0, 4)}`} has been waiting`,
      meta: `${capitalize(stale.status)} · Last moved ${relativeTime(stale.last_transition_at || stale.updated_at || stale.created_at)}`,
      pill: 'Laundry',
    });
  }

  const laundryMoments = [];
  for (const load of appState.loads) {
    const t = load.last_transition_at || load.updated_at || load.created_at;
    if (t) laundryMoments.push(new Date(t).getTime());
  }
  for (const log of appState.logs) {
    if (/laundry/i.test(log.event_type || '') || log.location === 'laundry') {
      if (log.created_at) laundryMoments.push(new Date(log.created_at).getTime());
    }
  }
  const lastLaundryAt = laundryMoments.length ? Math.max(...laundryMoments.filter(Number.isFinite)) : null;
  if (!activeLoads.length && (!lastLaundryAt || now - lastLaundryAt > 24 * 60 * 60 * 1000)) {
    items.push({
      title: 'No laundry done in over a day',
      meta: lastLaundryAt ? `Last laundry activity ${relativeTime(new Date(lastLaundryAt).toISOString())}` : 'No laundry activity logged yet.',
      pill: 'Reminder',
    });
  }

  return items;
}

function renderLaundrySignals() {
  const items = buildLaundrySignalItems();
  return renderList(items, 'No laundry signals right now.');
}

function renderLaundryLoads() {
  const wrapper = document.createElement('div');
  wrapper.className = 'list';

  const loads = [...appState.loads]
    .filter((load) => !load.archived_at && load.status !== 'done')
    .sort((a, b) => {
      const byStatus = loadStatusRank(a.status) - loadStatusRank(b.status);
      if (byStatus !== 0) return byStatus;
      return new Date(a.last_transition_at || a.updated_at || a.created_at) - new Date(b.last_transition_at || b.updated_at || b.created_at);
    });

  if (!loads.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No active loads right now.';
    wrapper.append(empty);
    return wrapper;
  }

  for (const load of loads) {
    const row = document.createElement('button');
    row.className = `load-row load-button status-${load.status}`;
    row.innerHTML = `
      <div class="load-row-main">
        <div class="list-item-title">${escapeHtml(load.label || `Load ${load.id.slice(0, 4)}`)}</div>
        <div class="list-item-meta">${loadNextStep(load.status)} · Last moved ${relativeTime(load.last_transition_at || load.updated_at || load.created_at)}</div>
      </div>
      <span class="pill">${escapeHtml(capitalize(load.status))}</span>
    `;
    row.addEventListener('click', () => advanceLoad(load, row));
    wrapper.append(row);
  }

  return wrapper;
}


function renderBedroomLaundry() {
  const wrapper = document.createElement('div');
  wrapper.className = 'list';

  const loads = [...appState.loads]
    .filter((load) => !load.archived_at && load.status !== 'done')
    .sort((a, b) => {
      const byStatus = loadStatusRank(a.status) - loadStatusRank(b.status);
      if (byStatus !== 0) return byStatus;
      return new Date(a.last_transition_at || a.updated_at || a.created_at) - new Date(b.last_transition_at || b.updated_at || b.created_at);
    })
    .slice(0, 3);

  if (!loads.length) {
    wrapper.append(buildEmptyState('No active loads to move right now.'));
    return wrapper;
  }

  for (const load of loads) {
    const row = document.createElement('button');
    row.className = `load-row load-button bedroom-load-row status-${load.status}`;
    const actionLabel = load.status === 'washing'
      ? 'Move to dryer'
      : load.status === 'drying'
      ? 'Mark ready'
      : 'Mark done';

    row.innerHTML = `
      <div class="load-row-main">
        <div class="list-item-title">${escapeHtml(load.label || `Load ${load.id.slice(0, 4)}`)}</div>
        <div class="list-item-meta">${loadNextStep(load.status)} · Last moved ${relativeTime(load.last_transition_at || load.updated_at || load.created_at)}</div>
      </div>
      <div class="bedroom-load-actions">
        <span class="pill">${escapeHtml(capitalize(load.status))}</span>
        <span class="bedroom-load-cta">${escapeHtml(actionLabel)}</span>
      </div>
    `;
    row.addEventListener('click', () => advanceLoad(load, row));
    wrapper.append(row);
  }

  return wrapper;
}

function renderList(items, emptyText) {
  return renderTaskList(items, emptyText, { showPills: true });
}

function renderTaskList(items, emptyText, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `list ${options.compact ? 'list-compact' : ''}`.trim();
  if (!items.length) {
    wrapper.append(buildEmptyState(emptyText));
    return wrapper;
  }
  for (const item of items) {
    const onActivate = typeof item.onActivate === 'function' ? item.onActivate : null;
    wrapper.append(buildListItem(item, { showPills: options.showPills, onActivate }));
  }
  return wrapper;
}

function renderSpotlightCard(item) {
  const wrap = document.createElement('div');
  if (!item) {
    return buildEmptyState('No standout task yet. Once the board has today or overdue work, it will appear here.');
  }

  const badge = document.createElement('div');
  badge.className = 'hero-pill';
  badge.textContent = item.pill || 'Task';

  const title = document.createElement('div');
  title.className = 'focus-text';
  title.textContent = item.title;

  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.textContent = item.meta || '';

  wrap.append(badge, title, meta);
  return wrap;
}

function renderFocusBlock(item) {
  const wrap = document.createElement('div');
  if (!item) {
    return buildEmptyState('Nothing is pressing right now.');
  }
  const big = document.createElement('div');
  big.className = 'focus-text';
  big.textContent = item.title;
  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.textContent = item.meta || '';
  wrap.append(big, meta);
  return wrap;
}

function renderContextStack() {
  const items = [];
  const weather = getSnapshot(appState.config.weatherSnapshotType);
  const todayCal = getSnapshot(appState.config.calendarTodaySnapshotType);
  if (weather?.payload?.summary) {
    items.push({
      title: formatWeatherSummary(weather.payload, { includeTomorrow: isEvening() }),
      meta: [cleanLocationName(weather.payload.locationName), snapshotMetaLabel('Weather', weather)].filter(Boolean).join(' · '),
      pill: snapshotFreshnessPill(weather),
      pillClass: snapshotFreshnessClass(weather),
    });
  }
  const next = Array.isArray(todayCal?.payload?.items) ? todayCal.payload.items[0] : null;
  if (next) {
    items.push({
      title: next.title,
      meta: [snapshotMetaLabel('Next event', todayCal), next.time, next.sourceLabel].filter(Boolean).join(' · '),
      pill: snapshotFreshnessPill(todayCal, 'Calendar'),
      pillClass: snapshotFreshnessClass(todayCal),
    });
  }
  return renderTaskList(items, 'Weather or calendar data is not connected yet.', { showPills: true });
}

function renderTaskMappingSummary() {
  const fields = [
    ['Task table', appState.config.taskTable],
    ['Title field', appState.config.taskTitleField],
    ['Owner field', appState.config.taskOwnerField],
    ['Due date field', appState.config.taskDateField],
    ['Completed field', appState.config.taskCompletedField],
  ];

  const wrap = document.createElement('div');
  wrap.className = 'list';
  for (const [label, value] of fields) {
    const row = document.createElement('div');
    row.className = 'meta-row';
    const left = document.createElement('div');
    left.textContent = label;
    const right = document.createElement('code');
    right.textContent = value || '—';
    row.append(left, right);
    wrap.append(row);
  }
  return wrap;
}




function loadHousekeepingDiagnostics() {
  try {
    const raw = localStorage.getItem(HOUSEKEEPING_REPORT_STORAGE);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { lastRunAt: '', results: [] };
    return {
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : '',
      results: Array.isArray(parsed.results) ? parsed.results.slice(0, 8) : [],
    };
  } catch {
    return { lastRunAt: '', results: [] };
  }
}

function persistHousekeepingDiagnostics() {
  try {
    const payload = appState.housekeepingDiagnostics || { lastRunAt: '', results: [] };
    localStorage.setItem(HOUSEKEEPING_REPORT_STORAGE, JSON.stringify({
      lastRunAt: payload.lastRunAt || '',
      results: Array.isArray(payload.results) ? payload.results.slice(0, 8) : [],
    }));
  } catch {}
}

function updateHousekeepingResult(entry) {
  const diagnostics = appState.housekeepingDiagnostics || (appState.housekeepingDiagnostics = { lastRunAt: '', results: [] });
  const next = {
    table: entry?.table || '',
    label: entry?.label || entry?.table || 'Unknown table',
    retentionDays: Number.isFinite(entry?.retentionDays) ? entry.retentionDays : null,
    cutoffIso: entry?.cutoffIso || '',
    ok: entry?.ok !== false,
    prunedRows: Number.isFinite(entry?.prunedRows) ? entry.prunedRows : null,
    updatedAt: new Date(getNowMs()).toISOString(),
    error: entry?.error || '',
  };
  const results = Array.isArray(diagnostics.results) ? diagnostics.results.slice() : [];
  const index = results.findIndex((item) => item && item.table === next.table);
  if (index >= 0) results[index] = next;
  else results.push(next);
  diagnostics.results = results.slice(0, 8);
  diagnostics.lastRunAt = next.updatedAt;
  persistHousekeepingDiagnostics();
}

function loadCalendarAccounts() {
  try {
    const raw = localStorage.getItem(CALENDAR_ACCOUNTS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


async function fetchHouseholdConfig() {
  if (!appState.supabase) return;
  const ioStartedAt = startIoOperation('reads', 'householdConfig', 'fetchHouseholdConfig');
  try {
    const { data, error } = await appState.supabase
      .from(SHARED_CONFIG_TABLE)
      .select('key, value, updated_at');
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    finishIoOperation('reads', 'householdConfig', ioStartedAt, { ok: true, rows: rows.length, reason: 'fetchHouseholdConfig' });
    applySharedConfigRows(rows);
    pushDevLog('info', `Loaded ${rows.length} household config entr${rows.length === 1 ? 'y' : 'ies'}.`);
  } catch (error) {
    finishIoOperation('reads', 'householdConfig', ioStartedAt, { ok: false, reason: 'fetchHouseholdConfig', error: error?.message || String(error) });
    pushDevLog('warn', `Household config unavailable: ${error?.message || error}`);
  }
}


async function pruneOldRows(table, builder, label, options = {}) {
  if (!appState.supabase) return;
  const ioStartedAt = startIoOperation('writes', 'housekeeping', `${label} prune`);
  const retentionDays = Number.isFinite(options.retentionDays) ? options.retentionDays : null;
  const cutoffIso = options.cutoffIso || '';
  try {
    const { data, error } = await builder(appState.supabase.from(table).delete().select('id'));
    if (error) throw error;
    const prunedRows = Array.isArray(data) ? data.length : null;
    finishIoOperation('writes', 'housekeeping', ioStartedAt, { ok: true, reason: `${label} prune`, rows: prunedRows });
    updateHousekeepingResult({ table, label, retentionDays, cutoffIso, ok: true, prunedRows });
    pushDevLog('info', `${label} pruned${Number.isFinite(prunedRows) ? ` (${prunedRows})` : ''}.`);
  } catch (error) {
    finishIoOperation('writes', 'housekeeping', ioStartedAt, { ok: false, reason: `${label} prune`, error: error?.message || String(error) });
    updateHousekeepingResult({ table, label, retentionDays, cutoffIso, ok: false, error: error?.message || String(error) });
    pushDevLog('warn', `${label} prune skipped: ${error?.message || error}`);
  }
}

async function runHousekeeping(force = false) {
  if (!appState.supabase || appState.config.mode !== 'mobile') return;
  const nowMs = getNowMs();
  const lastRun = Number(localStorage.getItem(HOUSEKEEPING_LAST_RUN_STORAGE) || 0);
  if (!force && lastRun && (nowMs - lastRun) < (HOUSEKEEPING_INTERVAL_SECONDS * 1000)) return;

  const snapshotCutoff = new Date(nowMs - SNAPSHOT_RETENTION_DAYS * 86400000).toISOString();
  const logCutoff = new Date(nowMs - LOG_RETENTION_DAYS * 86400000).toISOString();
  const signalCutoff = new Date(nowMs - RESOLVED_SIGNAL_RETENTION_DAYS * 86400000).toISOString();
  const loadCutoff = new Date(nowMs - LOAD_RETENTION_DAYS * 86400000).toISOString();

  await pruneOldRows('context_snapshots', (q) => q.lt('created_at', snapshotCutoff), 'Old snapshots', { retentionDays: SNAPSHOT_RETENTION_DAYS, cutoffIso: snapshotCutoff });
  await pruneOldRows('household_logs', (q) => q.lt('created_at', logCutoff), 'Old logs', { retentionDays: LOG_RETENTION_DAYS, cutoffIso: logCutoff });
  await pruneOldRows('household_signals', (q) => q.in('status', ['dismissed', 'resolved']).lt('updated_at', signalCutoff), 'Resolved signals', { retentionDays: RESOLVED_SIGNAL_RETENTION_DAYS, cutoffIso: signalCutoff });
  await pruneOldRows('laundry_loads', (q) => q.lt('updated_at', loadCutoff).or('status.eq.done,archived_at.not.is.null'), 'Completed laundry loads', { retentionDays: LOAD_RETENTION_DAYS, cutoffIso: loadCutoff });

  localStorage.setItem(HOUSEKEEPING_LAST_RUN_STORAGE, String(nowMs));
}

async function compactSnapshotsForType(contextType, keepAfterIso) {
  if (!appState.supabase) return;
  const { error } = await appState.supabase
    .from('context_snapshots')
    .delete()
    .eq('context_type', contextType)
    .lt('created_at', keepAfterIso);
  if (error) throw error;
}

async function publishContextSnapshot(contextType, payload, source = 'headless-google-calendar', validMinutes = 15) {
  if (!appState.supabase) throw new Error('Supabase not connected');
  const ioStartedAt = startIoOperation('writes', 'snapshotPublish', contextType);
  const row = {
    context_type: contextType,
    payload,
    source,
    valid_until: new Date(getNowMs() + validMinutes * 60 * 1000).toISOString(),
  };
  const { error } = await appState.supabase.from('context_snapshots').insert(row);
  if (error) {
    finishIoOperation('writes', 'snapshotPublish', ioStartedAt, { ok: false, reason: contextType, error: error?.message || String(error) });
    throw error;
  }
  finishIoOperation('writes', 'snapshotPublish', ioStartedAt, { ok: true, rows: 1, reason: contextType });
  const retentionCutoff = new Date(getNowMs() - SNAPSHOT_RETENTION_DAYS * 86400000).toISOString();
  compactSnapshotsForType(contextType, retentionCutoff).catch((compactError) => console.warn(`Snapshot compaction warning for ${contextType}`, compactError));
}


function applySharedConfigRows(rows) {
  const map = {};
  const meta = {};
  for (const row of rows || []) {
    map[row.key] = row.value;
    meta[row.key] = { updated_at: row.updated_at || null };
  }
  appState.sharedConfig = map;
  appState.sharedConfigMeta = meta;
  applySharedConfigToLocalState(map);
  persistLocalConfig();
  try { fillSettingsForm(); } catch {}
}

async function upsertSharedConfigEntry(key, value) {
  if (!appState.supabase) throw new Error('Supabase not connected');
  const ioStartedAt = startIoOperation('writes', 'sharedConfigUpsert', key);
  const payload = { key, value, updated_at: new Date(getNowMs()).toISOString() };
  const { error } = await appState.supabase.from(SHARED_CONFIG_TABLE).upsert(payload, { onConflict: 'key' });
  if (error) {
    finishIoOperation('writes', 'sharedConfigUpsert', ioStartedAt, { ok: false, reason: key, error: error?.message || String(error) });
    throw error;
  }
  finishIoOperation('writes', 'sharedConfigUpsert', ioStartedAt, { ok: true, rows: 1, reason: key });
}

async function pushSharedWeatherConfig() {
  const payload = {
    weatherLocationQuery: appState.config.weatherLocationQuery || '',
    weatherLocationName: appState.config.weatherLocationName || '',
    weatherLatitude: appState.config.weatherLatitude || '',
    weatherLongitude: appState.config.weatherLongitude || '',
    weatherTimezone: appState.config.weatherTimezone || '',
  };
  await upsertSharedConfigEntry(SHARED_CONFIG_KEYS.weather, payload);
  appState.sharedConfig[SHARED_CONFIG_KEYS.weather] = payload;
  showToast('Pushed weather config to household', 'success');
  pushDevLog('info', 'Pushed weather config to household.');
}

async function pushSharedSignalConfig() {
  const payload = normalizeSignalRules(appState.signalRulesDraft || DEFAULT_SIGNAL_RULES);
  await upsertSharedConfigEntry(SHARED_CONFIG_KEYS.signalRules, payload);
  appState.sharedConfig[SHARED_CONFIG_KEYS.signalRules] = payload;
  appState.signalRulesDraft = normalizeSignalRules(payload);
  appState.config.signalRulesDraft = normalizeSignalRules(payload);
  persistLocalConfig();
  showToast('Pushed signal config to household', 'success');
  pushDevLog('info', 'Pushed signal config to household.');
}

async function pushSharedCalendarConfig() {
  const sharedAccounts = sanitizeCalendarAccountsForShare(appState.calendarAccounts || []);
  await upsertSharedConfigEntry(SHARED_CONFIG_KEYS.googleClientId, appState.config.googleClientId || '');
  await upsertSharedConfigEntry(SHARED_CONFIG_KEYS.calendarAccounts, sharedAccounts);
  appState.sharedConfig[SHARED_CONFIG_KEYS.googleClientId] = appState.config.googleClientId || '';
  appState.sharedConfig[SHARED_CONFIG_KEYS.calendarAccounts] = sharedAccounts;
  showToast('Pushed calendar config to household', 'success');
  pushDevLog('info', 'Pushed calendar config to household.');
}

function saveCalendarAccounts(accounts, options = {}) {
  appState.calendarAccounts = Array.isArray(accounts) ? accounts : [];
  try {
    localStorage.setItem(CALENDAR_ACCOUNTS_STORAGE, JSON.stringify(appState.calendarAccounts));
  } catch {}
  renderCalendarAccounts();
  renderDevConsole();
  try { window.refreshCalendarAuthIndicators && window.refreshCalendarAuthIndicators(); } catch {}
}

function isCalendarAccountExpired(account) {
  if (account?.serverManaged || account?.connected) return false;
  if (!account?.expiresAt) return true;
  return !account?.accessToken || Date.now() > Number(account.expiresAt) - 60 * 1000;
}

function hasPublisherCalendarAccounts() {
  return (appState.calendarAccounts || []).some(account =>
    (account?.serverManaged || (!!account?.accessToken && !isCalendarAccountExpired(account))) &&
    (account.calendars || []).some(cal => cal.selected)
  );
}

async function waitForGoogleIdentity(timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.google?.accounts?.oauth2?.initTokenClient || window.google?.accounts?.oauth2?.initCodeClient) return window.google.accounts.oauth2;
    if (window.__hccGoogleLoadError) throw new Error('Google Identity Services failed to load');
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  throw new Error('Google Identity Services unavailable');
}


async function requestGoogleAccessToken(loginHint, prompt = '') {
  if (!appState.config.googleClientId) throw new Error('Google client ID missing');
  const oauth2 = await waitForGoogleIdentity();
  return await new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: appState.config.googleClientId,
      scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      login_hint: loginHint || undefined,
      prompt,
      callback: (response) => {
        if (!response || response.error) {
          reject(new Error(response?.error || 'Google authorization failed'));
          return;
        }
        resolve(response);
      },
    });
    tokenClient.requestAccessToken();
  });
}


async function exchangeGoogleCalendarAuthCode(code) {
  if (!appState.config.supabaseUrl) throw new Error('Supabase URL missing');
  if (!appState.config.supabaseKey) throw new Error('Supabase key missing');
  const response = await fetch(`${appState.config.supabaseUrl}/functions/v1/Google-calendar-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': appState.config.supabaseKey,
    },
    body: JSON.stringify({
      code,
      redirectUri: window.location.origin,
      deviceKey: appState.deviceKey,
      deviceName: appState.config.deviceName || '',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Google auth exchange failed:', payload);
    throw new Error(payload?.error || payload?.message || `Google auth exchange failed (${response.status})`);
  }
  return payload || {};
}

async function finishGoogleCalendarCodeFlow(code) {
  const payload = await exchangeGoogleCalendarAuthCode(code);
  const accessToken = payload.access_token || '';
  const userInfo = payload.user || (accessToken ? await fetchGoogleUserInfo(accessToken) : null);
  const existing = appState.calendarAccounts.find(account => account.email === userInfo?.email);
  const rawCalendars = Array.isArray(payload.calendars)
    ? payload.calendars
    : (existing?.calendars || []);
  if (!userInfo?.email) throw new Error('Google account email missing after authorization');
  const accountRecord = {
    email: userInfo.email,
    name: userInfo.name || userInfo.email,
    accessToken: accessToken || existing?.accessToken || '',
    expiresAt: accessToken ? (Date.now() + Number(payload.expires_in || 3600) * 1000) : (existing?.expiresAt || 0),
    calendars: mergeCalendarSelections(existing?.calendars, rawCalendars),
    authMode: 'code',
    needsReconnect: false,
    serverManaged: true,
    connected: true,
  };
  const nextAccounts = appState.calendarAccounts.filter(account => account.email !== accountRecord.email);
  nextAccounts.push(accountRecord);
  saveCalendarAccounts(nextAccounts);
  const connectedLabel = stripEmailLikeText(accountRecord.name || '') || accountRecord.email;
  showToast(`Connected ${connectedLabel}`, 'success');
  pushDevLog('info', `Connected Google Calendar account ${connectedLabel} via authorization code flow.`);
  return accountRecord;
}

async function handleGoogleCalendarAuthRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state') || '';
  if (!code && !error) return false;

  const expectedState = consumeGoogleAuthRedirectState();
  const cleanupUrl = new URL(window.location.href);
  cleanupUrl.searchParams.delete('code');
  cleanupUrl.searchParams.delete('scope');
  cleanupUrl.searchParams.delete('authuser');
  cleanupUrl.searchParams.delete('prompt');
  cleanupUrl.searchParams.delete('state');
  cleanupUrl.searchParams.delete('error');
  cleanupUrl.searchParams.delete('error_subtype');
  cleanupUrl.searchParams.delete('hd');
  cleanupUrl.searchParams.delete('session_state');
  window.history.replaceState({}, document.title, cleanupUrl.toString());

  if (error) {
    pushDevLog('warn', `Google auth redirect returned ${error}.`);
    showToast('Google Calendar connection was cancelled', 'error');
    return true;
  }
  if (expectedState && state && expectedState !== state) {
    pushDevLog('warn', 'Google auth redirect state mismatch.');
    showToast('Google Calendar sign-in could not be verified', 'error');
    return true;
  }
  try {
    setStatus('Finishing Google Calendar sign-in…');
    await finishGoogleCalendarCodeFlow(code);
    if (appState.supabase) await refreshAll('google calendar auth redirect', { includeSlowState: true });
  } catch (error) {
    console.error('Google auth redirect handling failed', error);
    pushDevLog('warn', `Google auth redirect failed: ${error?.message || error}`);
    showToast('Could not finish Google Calendar connection', 'error');
  }
  return true;
}

async function refreshExpiredCalendarTokens() {
  const expired = appState.calendarAccounts.filter(isCalendarAccountExpired);
  if (!expired.length || !appState.config.googleClientId) return;
  pushDevLog('info', `Attempting silent refresh for ${expired.length} calendar account${expired.length === 1 ? '' : 's'}.`);
  let changed = false;
  for (const account of expired) {
    try {
      const response = await requestGoogleAccessToken(account.email, '');
      const nextAccounts = appState.calendarAccounts.map(item => item.email !== account.email ? item : {
        ...item,
        accessToken: response.access_token,
        expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
      });
      saveCalendarAccounts(nextAccounts);
      changed = true;
      pushDevLog('info', `Refreshed Google token for ${account.email}.`);
    } catch (error) {
      pushDevLog('warn', `Could not silently refresh Google token for ${account.email}: ${error?.message || error}`);
    }
  }
  if (changed) renderCalendarAccounts();
}

async function googleApiFetch(url, accessToken) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Google API error ${response.status}`);
  }
  return response.json();
}

async function fetchGoogleUserInfo(accessToken) {
  return googleApiFetch('https://www.googleapis.com/oauth2/v3/userinfo', accessToken);
}

async function fetchGoogleCalendarList(accessToken) {
  const data = await googleApiFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', accessToken);
  return Array.isArray(data.items) ? data.items : [];
}

function mergeCalendarSelections(existingCalendars, freshCalendars) {
  const existingMap = new Map((existingCalendars || []).map(cal => [cal.id, cal]));
  return freshCalendars.map(cal => ({
    id: cal.id,
    summary: cal.summary || cal.id,
    primary: !!cal.primary,
    backgroundColor: cal.backgroundColor || '',
    selected: existingMap.has(cal.id) ? !!existingMap.get(cal.id).selected : !!cal.primary,
  }));
}

async function connectGoogleCalendarAccount() {
  if (!appState.config.googleClientId) {
    showToast('Add your Google OAuth client ID in Settings first', 'error');
    return;
  }
  try {
    const oauth2 = await waitForGoogleIdentity();
    const codeClient = oauth2.initCodeClient({
      client_id: appState.config.googleClientId,
      scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      ux_mode: 'popup',
      redirect_uri: window.location.origin,
      include_granted_scopes: true,
      select_account: true,
      prompt: 'consent',
      callback: async (response) => {
        try {
          if (!response || response.error || !response.code) {
            throw new Error(response?.error || 'Google authorization failed');
          }
          setStatus('Finishing Google Calendar sign-in…');
          await finishGoogleCalendarCodeFlow(response.code);
          if (appState.supabase) await refreshAll('google calendar popup auth', { includeSlowState: true });
        } catch (error) {
          console.error('Google popup auth failed', error);
          pushDevLog('warn', `Google popup auth failed: ${error?.message || error}`);
          showToast('Could not finish Google Calendar connection', 'error');
        }
      },
    });
    pushDevLog('info', 'Started Google authorization popup flow');
    codeClient.requestCode();
  } catch (error) {
    console.error('Google account connect failed', error);
    showToast('Could not connect Google Calendar', 'error');
  }
}


function weatherCodeLabel(code) {
  const groups = {
    0: 'Clear',
    1: 'Mostly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog', 48: 'Fog',
    51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
  };
  return groups[Number(code)] || 'Weather';
}

function buildWeatherQueryCandidates(query) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const variants = new Set([raw]);
  const expanded = raw
    .replace(/\bNT\b/gi, 'Northern Territory')
    .replace(/\bSA\b/gi, 'South Australia')
    .replace(/\bNSW\b/gi, 'New South Wales')
    .replace(/\bQLD\b/gi, 'Queensland')
    .replace(/\bVIC\b/gi, 'Victoria')
    .replace(/\bWA\b/gi, 'Western Australia')
    .replace(/\bTAS\b/gi, 'Tasmania');
  variants.add(expanded);
  if (!/australia/i.test(raw)) {
    variants.add(`${raw}, Australia`);
    variants.add(`${expanded}, Australia`);
  }
  if (/alice springs/i.test(raw) && !/australia/i.test(raw)) {
    variants.add('Alice Springs, Northern Territory, Australia');
  }
  return Array.from(variants).filter(Boolean);
}

async function geocodeWeatherLocation(query) {
  const attempts = buildWeatherQueryCandidates(query);
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', attempt);
      url.searchParams.set('count', '5');
      url.searchParams.set('language', 'en');
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Weather geocoding failed (${response.status})`);
      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const item = results[0];
      if (!item) throw new Error('Weather location not found');
      return {
        name: item.name || [item.name, item.admin1, item.country].filter(Boolean).join(', '),
        latitude: String(item.latitude),
        longitude: String(item.longitude),
        timezone: item.timezone || 'auto',
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Weather location not found');
}

function formatWeatherSummary(payload, options = {}) {
  if (!payload) return 'Weather snapshot not loaded yet';
  const bits = [];
  if (Number.isFinite(payload.currentTemp)) bits.push(`${payload.currentTemp}°`);
  if (payload.weatherLabel) bits.push(payload.weatherLabel);
  if (Number.isFinite(payload.high) && Number.isFinite(payload.low)) bits.push(`H ${payload.high}° · L ${payload.low}°`);
  if (options.includeTomorrow && Number.isFinite(payload.tomorrowHigh) && Number.isFinite(payload.tomorrowLow)) {
    const tomorrowBits = [`Tomorrow ${payload.tomorrowHigh}°/${payload.tomorrowLow}°`];
    if (payload.tomorrowWeatherLabel) tomorrowBits.push(payload.tomorrowWeatherLabel);
    bits.push(tomorrowBits.join(' · '));
  }
  return bits.filter(Boolean).join(' · ') || (payload.locationName || 'Weather unavailable');
}

async function fetchWeatherSnapshot() {
  const existingSnapshot = appState.snapshots[appState.config.weatherSnapshotType] || null;

  let query = String(appState.config.weatherLocationQuery || '').trim();
  let latitude = String(appState.config.weatherLatitude || '').trim();
  let longitude = String(appState.config.weatherLongitude || '').trim();
  let timezone = String(appState.config.weatherTimezone || '').trim();
  let locationName = cleanLocationName(String(appState.config.weatherLocationName || '').trim());

  const sharedWeather = appState.sharedConfig?.[SHARED_CONFIG_KEYS.weather];
  if ((!query && !latitude && !longitude) && sharedWeather && typeof sharedWeather === 'object') {
    query = String(sharedWeather.weatherLocationQuery || sharedWeather.locationQuery || '').trim();
    latitude = String(sharedWeather.weatherLatitude || sharedWeather.latitude || '').trim();
    longitude = String(sharedWeather.weatherLongitude || sharedWeather.longitude || '').trim();
    timezone = String(sharedWeather.weatherTimezone || sharedWeather.timezone || '').trim();
    locationName = cleanLocationName(String(sharedWeather.weatherLocationName || sharedWeather.locationName || locationName || '').trim());
    pushDevLog('info', 'Using shared weather config for refresh.');
  }

  if (!query && (!latitude || !longitude)) {
    pushDevLog('warn', 'Weather refresh skipped: no usable weather config found.');
    throw new Error('No usable weather config found');
  }

  if (!latitude || !longitude) {
    pushDevLog('info', `Geocoding weather location for ${query}.`);
    const geo = await geocodeWeatherLocation(query);
    latitude = geo.latitude;
    longitude = geo.longitude;
    timezone = geo.timezone;
    locationName = cleanLocationName(geo.name);
    appState.config = { ...appState.config, weatherLatitude: latitude, weatherLongitude: longitude, weatherTimezone: timezone, weatherLocationName: locationName, weatherLocationQuery: query };
    persistLocalConfig();
    try { fillSettingsForm(); } catch {}
  }

  pushDevLog('info', `Fetching weather forecast for ${locationName || query} (${latitude}, ${longitude}).`);

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('current', 'temperature_2m,weather_code,apparent_temperature');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('forecast_days', '2');
    url.searchParams.set('timezone', timezone || 'auto');
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Weather fetch failed (${response.status})`);
    const data = await response.json();

    const currentTemp = Math.round(Number(data.current?.temperature_2m));
    const high = Math.round(Number(data.daily?.temperature_2m_max?.[0]));
    const low = Math.round(Number(data.daily?.temperature_2m_min?.[0]));
    const code = Number(data.current?.weather_code ?? data.daily?.weather_code?.[0]);
    const tomorrowHigh = Math.round(Number(data.daily?.temperature_2m_max?.[1]));
    const tomorrowLow = Math.round(Number(data.daily?.temperature_2m_min?.[1]));
    const tomorrowCode = Number(data.daily?.weather_code?.[1]);
    const createdAt = getNowDate().toISOString();
    const payload = {
      locationName: cleanLocationName(locationName || query),
      currentTemp,
      high,
      low,
      weatherCode: code,
      weatherLabel: weatherCodeLabel(code),
      tomorrowHigh,
      tomorrowLow,
      tomorrowWeatherCode: tomorrowCode,
      tomorrowWeatherLabel: weatherCodeLabel(tomorrowCode),
    };
    payload.summary = formatWeatherSummary(payload, { includeTomorrow: false });
    payload.tomorrowSummary = formatWeatherSummary(payload, { includeTomorrow: true });
    appState.snapshots[appState.config.weatherSnapshotType] = {
      context_type: appState.config.weatherSnapshotType,
      created_at: createdAt,
      valid_until: new Date(getNowMs() + 30 * 60 * 1000).toISOString(),
      payload,
      source: 'live-weather',
    };
    pushDevLog('info', `Weather refresh succeeded for ${payload.locationName}.`);
  } catch (error) {
    if (existingSnapshot?.payload) {
      appState.snapshots[appState.config.weatherSnapshotType] = {
        ...existingSnapshot,
        stale: true,
        stale_reason: error?.message || 'Weather refresh failed',
      };
      pushDevLog('warn', `Weather refresh failed, keeping last good weather: ${error?.message || error}`);
      return;
    }
    pushDevLog('warn', `Weather refresh failed with no fallback: ${error?.message || error}`);
    throw error;
  }
}

function renderCalendarAccountsPanel(options = {}) {
  const { editable = false } = options;
  const host = document.createElement('div');
  host.className = 'google-calendar-accounts';
  if (!appState.calendarAccounts.length) {
    host.append(buildEmptyState('No Google accounts connected yet.', editable ? 'compact-empty' : ''));
    return host;
  }

  for (const account of appState.calendarAccounts) {
    const card = document.createElement('div');
    card.className = 'calendar-account-card';

    const header = document.createElement('div');
    header.className = 'calendar-account-header';

    if (editable) {
      const left = document.createElement('div');
      left.innerHTML = `<strong>${escapeHtml(account.name || account.email)}</strong><div class="muted">${escapeHtml(account.email || '')}${isCalendarAccountExpired(account) ? ' · reconnect needed' : ''}</div>`;
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'secondary-button mini-button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        saveCalendarAccounts(appState.calendarAccounts.filter(item => item.email !== account.email));
        refreshAll('calendar account removed', { includeSlowState: true }).catch((error) => console.error('Refresh after removing calendar account failed', error));
      });
      header.append(left, removeButton);
    } else {
      const titleWrap = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'calendar-account-title';
      title.textContent = account.displayName || account.name || account.email || 'Google account';
      const subtitle = document.createElement('div');
      subtitle.className = 'muted';
      const selectedCount = (account.calendars || []).filter((calendar) => calendar.selected).length;
      subtitle.textContent = `${selectedCount} selected calendar${selectedCount === 1 ? '' : 's'}${isCalendarAccountExpired(account) ? ' · reconnect needed' : ''}`;
      titleWrap.append(title, subtitle);
      header.append(titleWrap);
    }
    card.append(header);

    const calList = document.createElement('div');
    calList.className = 'calendar-list';
    for (const calendar of account.calendars || []) {
      if (editable) {
        const row = document.createElement('label');
        row.className = 'calendar-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!calendar.selected;
        checkbox.addEventListener('change', () => {
          const next = appState.calendarAccounts.map(item => item.email !== account.email ? item : {
            ...item,
            calendars: item.calendars.map(cal => cal.id !== calendar.id ? cal : { ...cal, selected: checkbox.checked }),
          });
          saveCalendarAccounts(next);
          refreshAll('calendar selection changed', { includeSlowState: true }).catch((error) => console.error('Refresh after calendar toggle failed', error));
        });
        const labelText = document.createElement('span');
        labelText.textContent = calendar.summary || calendar.id;
        row.append(checkbox, labelText);
        calList.append(row);
      } else {
        const row = document.createElement('div');
        row.className = 'calendar-list-item';
        const label = document.createElement('span');
        label.textContent = calendar.summary || calendar.id;
        row.append(label, buildPill(calendar.selected ? 'Included' : 'Hidden'));
        calList.append(row);
      }
    }
    card.append(calList);
    host.append(card);
  }
  return host;
}

function renderCalendarAccounts() {
  if (!googleCalendarAccountsEl) return;
  googleCalendarAccountsEl.replaceChildren(renderCalendarAccountsPanel({ editable: true }));
}

function formatCalendarEventTime(event) {
  if (event.start?.date) return 'All day';
  const startValue = event.start?.dateTime;
  if (!startValue) return '';
  const date = new Date(startValue);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function normalizeCalendarEvent(event, account, calendar) {
  return {
    id: event.id,
    title: event.summary || '(Untitled event)',
    time: formatCalendarEventTime(event),
    sourceLabel: getCalendarSourceLabel(account, calendar),
    start: event.start?.dateTime || event.start?.date || '',
  };
}

function snapshotItemsSignature(items) {
  return JSON.stringify((items || []).map(item => ({
    id: item.id || '',
    title: item.title || '',
    start: item.start || '',
    time: item.time || '',
    sourceLabel: item.sourceLabel || '',
  })));
}

function shouldPublishCalendarSnapshots(todayItems, tomorrowItems) {
  const currentToday = getSnapshotPayload(appState.config.calendarTodaySnapshotType)?.items || [];
  const currentTomorrow = getSnapshotPayload(appState.config.calendarTomorrowSnapshotType)?.items || [];
  return snapshotItemsSignature(todayItems) !== snapshotItemsSignature(currentToday)
    || snapshotItemsSignature(tomorrowItems) !== snapshotItemsSignature(currentTomorrow);
}

function noteCalendarPublisherAttempt(reason, extra = {}) {
  appState.calendarPublisherDiagnostics = {
    ...appState.calendarPublisherDiagnostics,
    lastAttemptAt: new Date(getNowMs()).toISOString(),
    lastAttemptReason: reason || 'publish-cycle',
    ...extra,
  };
}

function noteCalendarPublisherResult(status, extra = {}) {
  appState.calendarPublisherDiagnostics = {
    ...appState.calendarPublisherDiagnostics,
    lastPublishStatus: status || 'idle',
    ...extra,
  };
}


async function fetchServerManagedCalendarEvents() {
  if (!appState.config.supabaseUrl) throw new Error('Supabase URL missing');
  if (!appState.config.supabaseKey) throw new Error('Supabase key missing');
  const response = await fetch(`${appState.config.supabaseUrl}/functions/v1/google-calendar-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': appState.config.supabaseKey,
    },
    body: JSON.stringify({
      deviceKey: appState.deviceKey,
      selectedCalendars: (appState.calendarAccounts || []).flatMap((account) => (account.calendars || []).filter((cal) => cal.selected).map((cal) => ({
        accountEmail: account.email,
        id: cal.id,
        summary: cal.summary || cal.id,
      }))),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Calendar events fetch failed (${response.status})`);
  }
  return payload || {};
}

function normalizeServerManagedCalendarPayload(payload, now = getNowDate()) {
  const todayStart = startOfDay(now);
  const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const dayAfterStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
  if (Array.isArray(payload?.todayItems) || Array.isArray(payload?.tomorrowItems)) {
    return {
      todayItems: Array.isArray(payload?.todayItems) ? payload.todayItems : [],
      tomorrowItems: Array.isArray(payload?.tomorrowItems) ? payload.tomorrowItems : [],
      fetchedEvents: Number(payload?.fetchedEvents || ((payload?.todayItems?.length || 0) + (payload?.tomorrowItems?.length || 0))),
    };
  }
  const rawItems = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
  const todayItems = [];
  const tomorrowItems = [];
  for (const event of rawItems) {
    const starts = event?.start?.dateTime ? new Date(event.start.dateTime) : event?.start?.date ? new Date(`${event.start.date}T00:00:00`) : (event?.start ? new Date(event.start) : null);
    if (!starts || !Number.isFinite(starts.getTime())) continue;
    if (starts < todayStart || starts >= dayAfterStart) continue;
    const normalized = {
      id: event.id || event.eventId || `${event.summary || event.title || 'event'}-${event.start?.dateTime || event.start?.date || event.start || ''}`,
      title: event.summary || event.title || '(Untitled event)',
      time: event.time || formatCalendarEventTime(event),
      sourceLabel: event.sourceLabel || event.calendarSummary || event.calendar?.summary || 'Calendar',
      start: event.start?.dateTime || event.start?.date || event.start || '',
    };
    if (isSameDay(starts, todayStart)) todayItems.push(normalized);
    else if (isSameDay(starts, tomorrowStart)) tomorrowItems.push(normalized);
  }
  const sortByStart = (a, b) => String(a.start || '').localeCompare(String(b.start || ''));
  todayItems.sort(sortByStart);
  tomorrowItems.sort(sortByStart);
  return { todayItems, tomorrowItems, fetchedEvents: rawItems.length };
}

function buildCalendarPublisherDebugItems() {
  const diag = appState.calendarPublisherDiagnostics || {};
  const publisher = getCalendarServiceState();
  return [
    {
      title: `Publisher ready: ${diag.canPublish ? 'Yes' : 'No'}`,
      meta: `${diag.lastSelectedSources || 0} selected source${diag.lastSelectedSources === 1 ? '' : 's'}${publisher.publisher ? ` · Active publisher ${publisher.publisher}` : ''}`,
      pill: diag.canPublish ? 'Ready' : 'Idle',
      pillClass: diag.canPublish ? '' : 'warning',
    },
    {
      title: `Last publish: ${diag.lastPublishStatus || 'idle'}`,
      meta: [
        diag.lastPublishAt ? `At ${new Date(diag.lastPublishAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'No publish yet',
        diag.lastPublishSource ? `Source ${diag.lastPublishSource}` : '',
        Number.isFinite(diag.lastItemsToday) || Number.isFinite(diag.lastItemsTomorrow) ? `${diag.lastItemsToday || 0} today · ${diag.lastItemsTomorrow || 0} tomorrow` : '',
      ].filter(Boolean).join(' · '),
      pill: diag.lastPublishStatus === 'published' ? 'Published' : (diag.lastPublishStatus === 'skipped' ? 'Skipped' : (diag.lastPublishStatus === 'error' ? 'Error' : 'Idle')),
      pillClass: diag.lastPublishStatus === 'error' ? 'warning' : '',
    },
    {
      title: `Last attempt: ${diag.lastAttemptReason || 'Not attempted yet'}`,
      meta: [
        diag.lastAttemptAt ? `At ${new Date(diag.lastAttemptAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '',
        diag.lastSkipReason || diag.lastPublishError || '',
      ].filter(Boolean).join(' · ') || 'No publisher diagnostics yet.',
      pill: 'Trace',
    },
  ];
}

async function fetchGoogleCalendarSnapshots() {
  const canPublish = hasPublisherCalendarAccounts();
  noteCalendarPublisherAttempt('calendar-refresh', { canPublish });

  if (!canPublish) {
    const existingToday = appState.snapshots[appState.config.calendarTodaySnapshotType];
    const existingTomorrow = appState.snapshots[appState.config.calendarTomorrowSnapshotType];
    appState.calendarDiagnostics = {
      ...appState.calendarDiagnostics,
      selectedSources: 0,
      fetchedEvents: 0,
      mergedToday: existingToday?.payload?.items?.length || 0,
      mergedTomorrow: existingTomorrow?.payload?.items?.length || 0,
      expiredAccounts: (appState.calendarAccounts || []).filter(isCalendarAccountExpired).length,
      lastError: existingToday || existingTomorrow ? 'Using shared calendar snapshots on this device' : 'Calendar not connected on this device',
    };
    noteCalendarPublisherResult('idle', {
      canPublish: false,
      lastSelectedSources: 0,
      lastSkipReason: existingToday || existingTomorrow ? 'Using shared calendar snapshots on this device' : 'Calendar not connected on this device',
    });
    pushDevLog('info', existingToday || existingTomorrow
      ? 'Headless calendar mode: using shared snapshots only on this device.'
      : 'Headless calendar mode: no shared calendar snapshots available yet.');
    return;
  }

  await refreshExpiredCalendarTokens();
  const accounts = appState.calendarAccounts || [];
  const expiredAccounts = accounts.filter(isCalendarAccountExpired);
  const selectedSources = accounts
    .filter(account => (account?.serverManaged || (!isCalendarAccountExpired(account) && !!account.accessToken)))
    .flatMap(account => (account.calendars || []).filter(cal => cal.selected).map(calendar => ({ account, calendar })));

  appState.calendarDiagnostics = {
    ...appState.calendarDiagnostics,
    selectedSources: selectedSources.length,
    expiredAccounts: expiredAccounts.length,
    lastError: '',
  };
  appState.calendarPublisherDiagnostics = {
    ...appState.calendarPublisherDiagnostics,
    canPublish: true,
    lastSelectedSources: selectedSources.length,
    lastSkipReason: '',
    lastPublishError: '',
  };

  let todayItems = [];
  let tomorrowItems = [];
  let fetchedEvents = 0;

  const serverManagedAccounts = selectedSources.filter(({ account }) => account?.serverManaged);
  if (serverManagedAccounts.length) {
    try {
      const payload = await fetchServerManagedCalendarEvents();
      const normalized = normalizeServerManagedCalendarPayload(payload, getNowDate());
      todayItems = normalized.todayItems || [];
      tomorrowItems = normalized.tomorrowItems || [];
      fetchedEvents = Number(normalized.fetchedEvents || ((todayItems.length) + (tomorrowItems.length)));
      pushDevLog('info', `Fetched ${fetchedEvents} backend-managed calendar event${fetchedEvents === 1 ? '' : 's'}.`);
    } catch (error) {
      const msg = error?.message || String(error);
      appState.calendarDiagnostics.lastError = msg;
      pushDevLog('warn', `Backend calendar fetch failed: ${msg}`);
      console.warn('Backend calendar fetch failed', error);
    }
  }

  const clientSources = selectedSources.filter(({ account }) => !account?.serverManaged && !!account?.accessToken && !isCalendarAccountExpired(account));
  if (clientSources.length) {
    const now = getNowDate();
    const todayStart = startOfDay(now);
    const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const dayAfterStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
    for (const source of clientSources) {
      try {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendar.id)}/events`);
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        url.searchParams.set('timeMin', todayStart.toISOString());
        url.searchParams.set('timeMax', dayAfterStart.toISOString());
        url.searchParams.set('timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        url.searchParams.set('maxResults', '25');
        const data = await googleApiFetch(url.toString(), source.account.accessToken);
        const items = Array.isArray(data.items) ? data.items : [];
        fetchedEvents += items.length;
        pushDevLog('info', `Fetched ${items.length} event${items.length === 1 ? '' : 's'} from ${source.calendar.summary || source.calendar.id}.`);
        for (const event of items) {
          const normalized = normalizeCalendarEvent(event, source.account, source.calendar);
          const starts = event.start?.dateTime ? new Date(event.start.dateTime) : event.start?.date ? new Date(`${event.start.date}T00:00:00`) : null;
          if (!starts || !Number.isFinite(starts.getTime())) continue;
          if (isSameDay(starts, todayStart)) todayItems.push(normalized);
          else if (isSameDay(starts, tomorrowStart)) tomorrowItems.push(normalized);
        }
      } catch (error) {
        const msg = error?.message || String(error);
        appState.calendarDiagnostics.lastError = msg;
        pushDevLog('warn', `Calendar fetch failed for ${(source.calendar.summary || source.calendar.id)}: ${msg}`);
        console.warn(`Calendar fetch failed for ${source.account.email} / ${source.calendar.summary}`, error);
      }
    }
  }

  const sortByStart = (a, b) => String(a.start || '').localeCompare(String(b.start || ''));
  todayItems.sort(sortByStart);
  tomorrowItems.sort(sortByStart);
  const createdAt = getNowDate().toISOString();

  const snapshotSource = buildCalendarSnapshotSource();
  const todaySnapshot = {
    context_type: appState.config.calendarTodaySnapshotType,
    created_at: createdAt,
    valid_until: new Date(getNowMs() + 15 * 60 * 1000).toISOString(),
    payload: { items: todayItems },
    source: snapshotSource,
  };
  const tomorrowSnapshot = {
    context_type: appState.config.calendarTomorrowSnapshotType,
    created_at: createdAt,
    valid_until: new Date(getNowMs() + 15 * 60 * 1000).toISOString(),
    payload: { items: tomorrowItems },
    source: snapshotSource,
  };

  appState.snapshots[appState.config.calendarTodaySnapshotType] = todaySnapshot;
  appState.snapshots[appState.config.calendarTomorrowSnapshotType] = tomorrowSnapshot;

  try {
    if (shouldPublishCalendarSnapshots(todayItems, tomorrowItems)) {
      await publishContextSnapshot(todaySnapshot.context_type, todaySnapshot.payload, todaySnapshot.source, 15);
      await publishContextSnapshot(tomorrowSnapshot.context_type, tomorrowSnapshot.payload, tomorrowSnapshot.source, 15);
      noteCalendarPublisherResult('published', {
        lastPublishAt: createdAt,
        lastPublishSource: snapshotSource,
        lastItemsToday: todayItems.length,
        lastItemsTomorrow: tomorrowItems.length,
        lastSkipReason: '',
        lastPublishError: '',
      });
      pushDevLog('info', 'Published headless calendar snapshots to household.');
    } else {
      noteCalendarPublisherResult('skipped', {
        lastPublishSource: snapshotSource,
        lastItemsToday: todayItems.length,
        lastItemsTomorrow: tomorrowItems.length,
        lastSkipReason: 'Snapshots unchanged',
      });
      pushDevLog('info', 'Skipped publishing headless calendar snapshots because nothing changed.');
    }
  } catch (error) {
    noteCalendarPublisherResult('error', {
      lastPublishSource: snapshotSource,
      lastItemsToday: todayItems.length,
      lastItemsTomorrow: tomorrowItems.length,
      lastPublishError: error?.message || String(error),
    });
    pushDevLog('warn', `Could not publish headless calendar snapshots: ${error?.message || error}`);
  }

  appState.calendarDiagnostics = {
    ...appState.calendarDiagnostics,
    fetchedEvents,
    mergedToday: todayItems.length,
    mergedTomorrow: tomorrowItems.length,
    lastSuccessAt: createdAt,
    lastError: appState.calendarDiagnostics.lastError || '',
  };
  pushDevLog('info', `Merged ${todayItems.length} today event${todayItems.length === 1 ? '' : 's'} and ${tomorrowItems.length} tomorrow event${tomorrowItems.length === 1 ? '' : 's'}.`);
}

function buildKitchenTodayCard(context) {
  const wrap = document.createElement('div');
  wrap.className = 'kitchen-today-wrap';

  const actions = document.createElement('div');
  actions.className = 'inline-action-row';

  const allTasksBtn = document.createElement('button');
  allTasksBtn.className = 'secondary-button mini-button';
  allTasksBtn.textContent = `All Tasks (${context.digest.counts.all})`;
  allTasksBtn.addEventListener('click', () => openQuickView('All Tasks', context.digest.allItems, 'No active tasks right now.'));

  const allEventsBtn = document.createElement('button');
  allEventsBtn.className = 'secondary-button mini-button';
  allEventsBtn.textContent = `All Events (${context.digest.calendarTodayItems.length + context.digest.calendarTomorrowItems.length})`;
  allEventsBtn.addEventListener('click', () => openQuickView('All Events', context.digest.allEventItems, 'No calendar items loaded yet.'));

  actions.append(allTasksBtn, allEventsBtn);
  wrap.append(actions, renderTaskList(context.digest.todayBlend, 'Nothing important for today yet.', { showPills: true }));

  return buildCard('Today', buildKitchenHeadline(context.digest), wrap, 'kitchen-today-card');
}

function openQuickView(title, items, emptyText) {
  let dialog = document.getElementById('quick-view-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'quick-view-dialog';
    dialog.className = 'quick-view-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="quick-view-form settings-form">
        <div class="dialog-header">
          <h2 id="quick-view-title">Quick View</h2>
          <button value="cancel" class="secondary-button">Close</button>
        </div>
        <div id="quick-view-body"></div>
      </form>
    `;
    document.body.append(dialog);
  }
  dialog.querySelector('#quick-view-title').textContent = title;
  const body = dialog.querySelector('#quick-view-body');
  body.replaceChildren(renderTaskList(items, emptyText, { showPills: true }));
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', 'open');
}

function buildCard(title, subtitle, body, extraClass = '') {
  const template = document.getElementById('card-template');
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('h2').textContent = title;
  node.querySelector('.card-subtitle').textContent = subtitle || '';
  node.querySelector('.card-body').append(body);
  if (extraClass) node.classList.add(...extraClass.split(' '));
  return node;
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

function getTaskDueBucket(task, today = getNowDate()) {
  if (!task?.dueDate) return 'undated';
  if (task.dueDate < startOfDay(today)) return 'overdue';
  if (isSameDay(task.dueDate, today)) return 'today';
  if (isTomorrow(task.dueDate)) return 'tomorrow';
  return 'future';
}

function taskSignalStrength(task, signals) {
  if (!task || !signals?.length) return 0;
  const title = normalizeTokenText(task.title);
  const tag = normalizeTokenText(task.tag);
  let strength = 0;
  for (const signal of signals) {
    const signalTitle = normalizeTokenText(signal.title);
    const signalDescription = normalizeTokenText(signal.description || '');
    if (signal.related_task_id && signal.related_task_id === task.id) strength += 24;
    if (tag && (signalTitle.includes(tag) || signalDescription.includes(tag))) strength += 10;
    if (title && (signalTitle.includes(title) || signalDescription.includes(title))) strength += 8;
  }
  return strength;
}

function taskTomorrowEventStrength(task, tomorrowSnapshot) {
  if (!task || !Array.isArray(tomorrowSnapshot?.items) || !tomorrowSnapshot.items.length) return 0;
  const taskText = [task.title, task.tag, task.description, task.dueText].map(normalizeTokenText).join(' ');
  if (!taskText) return 0;
  const tokens = tomorrowSnapshot.items.flatMap((item) => tokenizeMeaningfulWords(item.title));
  let score = 0;
  for (const token of tokens) {
    if (taskText.includes(token)) score += 5;
  }
  return Math.min(score, 18);
}

function hasTomorrowPrepCue(task) {
  const combined = [task.title, task.tag, task.description, task.dueText].join(' ');
  return includesAnyToken(combined, ['prep', 'pack', 'set out', 'tonight', 'tomorrow', 'morning', 'school', 'appointment', 'reservation', 'delivery', 'birthday', 'party', 'trip']);
}

function hasEveningCue(task) {
  const combined = [task.title, task.tag, task.description, task.dueText].join(' ');
  return includesAnyToken(combined, ['tonight', 'evening', 'before bed', 'before tomorrow']);
}

function buildTaskIntelligenceContext(tasks = normalizeTaskRows(), options = {}) {
  const now = options.now || getNowDate();
  const todaySnapshot = options.todaySnapshot || getSnapshotPayload(appState.config.calendarTodaySnapshotType);
  const tomorrowSnapshot = options.tomorrowSnapshot || getSnapshotPayload(appState.config.calendarTomorrowSnapshotType);
  const signals = options.signals || activeSignals();
  const evening = options.evening ?? isEvening();
  const dueBucketById = new Map(tasks.map((task) => [task.id, getTaskDueBucket(task, now)]));
  return {
    tasks,
    now,
    todaySnapshot,
    tomorrowSnapshot,
    signals,
    evening,
    dueBucketById,
  };
}

function scoreTaskForWindow(task, options = {}) {
  const intelligenceContext = options.intelligenceContext || null;
  const now = intelligenceContext?.now || options.now || getNowDate();
  const dueBucket = intelligenceContext?.dueBucketById?.get(task.id) || getTaskDueBucket(task, now);
  const windowName = options.windowName || 'today';
  const signals = intelligenceContext?.signals || options.signals || [];
  const tomorrowSnapshot = intelligenceContext?.tomorrowSnapshot || options.tomorrowSnapshot || null;
  const evening = intelligenceContext?.evening ?? options.evening ?? isEvening();
  let score = 0;

  if (windowName === 'today') {
    if (dueBucket === 'overdue') score += 80;
    if (dueBucket === 'today') score += 58;
    if (dueBucket === 'tomorrow') score += evening ? 22 : 8;
    if (dueBucket === 'future') score -= 12;
    if (dueBucket === 'undated') score -= 18;
    if (evening && hasEveningCue(task)) score += 16;
  }

  if (windowName === 'tomorrow') {
    if (dueBucket === 'tomorrow') score += 62;
    if (dueBucket === 'today') score += evening ? 18 : 4;
    if (dueBucket === 'overdue') score += 14;
    if (dueBucket === 'future') score -= 8;
    if (dueBucket === 'undated') score -= 18;
    if (evening && hasTomorrowPrepCue(task)) score += 16;
    score += taskTomorrowEventStrength(task, tomorrowSnapshot);
  }

  if (String(task.panel || '').toLowerCase() === 'in motion') score += 12;
  if (task.recurrence) score += 7;
  score += taskSignalStrength(task, signals);
  if (task.isMine) score += 2;

  if (task.dueDate) {
    const diff = Math.abs(task.dueDate.getTime() - startOfDay(now).getTime());
    score += Math.max(0, 6 - Math.floor(diff / 86400000));
  }

  return score;
}

function rankTasksForWindow(tasks, options = {}) {
  const intelligenceContext = options.intelligenceContext || buildTaskIntelligenceContext(tasks, options);
  return [...tasks]
    .map((task) => ({ ...task, intelligenceScore: scoreTaskForWindow(task, { ...options, intelligenceContext }) }))
    .sort((a, b) => {
      if (b.intelligenceScore !== a.intelligenceScore) return b.intelligenceScore - a.intelligenceScore;
      if (a.sortScore !== b.sortScore) return a.sortScore - b.sortScore;
      return a.title.localeCompare(b.title);
    });
}

function mapSnapshotItemsToDisplay(items = [], labelPrefix = '') {
  return items.map((item, index) => ({
    id: item.id || item.eventId || item.uid || `${item.title || 'calendar'}-${item.time || index}`,
    itemKey: `calendar:${item.id || item.eventId || item.uid || `${item.title || 'calendar'}-${item.time || index}`}`,
    title: item.title,
    meta: [item.sourceLabel || 'Calendar', labelPrefix && item.time ? `${labelPrefix} · ${item.time}` : labelPrefix || item.time].filter(Boolean).join(' · '),
    pill: 'Calendar',
  }));
}

function selectTasksByDueBucket(tasks, dueBucketById, buckets) {
  return tasks.filter((task) => buckets.includes(dueBucketById.get(task.id)));
}

function selectTomorrowWindowTasks(rankedTomorrowTasks, intelligenceContext) {
  const { dueBucketById, evening } = intelligenceContext;
  return rankedTomorrowTasks.filter((task) => {
    const bucket = dueBucketById.get(task.id);
    return bucket === 'tomorrow' || (evening && bucket === 'today') || hasTomorrowPrepCue(task);
  }).slice(0, 8);
}

function buildTaskDigest() {
  const tasks = normalizeTaskRows();
  const intelligenceContext = buildTaskIntelligenceContext(tasks);
  const { todaySnapshot, tomorrowSnapshot, signals, dueBucketById } = intelligenceContext;

  const rankedTodayTasks = rankTasksForWindow(tasks, { windowName: 'today', intelligenceContext });
  const rankedTomorrowTasks = rankTasksForWindow(tasks, { windowName: 'tomorrow', intelligenceContext });

  const overdueTasks = selectTasksByDueBucket(rankedTodayTasks, dueBucketById, ['overdue']);
  const upcomingTasks = selectTasksByDueBucket(rankedTodayTasks, dueBucketById, ['future']).slice(0, 8);
  const todayTasks = selectTasksByDueBucket(rankedTodayTasks, dueBucketById, ['today', 'overdue']);
  const inMotionTasks = rankedTodayTasks.filter((task) => String(task.panel || '').toLowerCase() === 'in motion').slice(0, 6);
  const undatedTasks = selectTasksByDueBucket(rankedTodayTasks, dueBucketById, ['undated']);
  const tomorrowOnlyTasks = selectTasksByDueBucket(rankedTomorrowTasks, dueBucketById, ['tomorrow']);

  const calendarTodayItems = Array.isArray(todaySnapshot?.items)
    ? mapSnapshotItemsToDisplay(todaySnapshot.items)
    : [];
  const calendarTomorrowItems = Array.isArray(tomorrowSnapshot?.items)
    ? mapSnapshotItemsToDisplay(tomorrowSnapshot.items, 'Tomorrow')
    : [];

  const todayTaskItems = toDisplayTaskItems(todayTasks.length ? todayTasks : undatedTasks.slice(0, 6), 'Today');
  const overdueTaskItems = toDisplayTaskItems(overdueTasks, 'Overdue');
  const upcomingTaskItems = toDisplayTaskItems(upcomingTasks, 'Upcoming');
  const inMotionTaskItems = toDisplayTaskItems(inMotionTasks, 'In Motion');
  const allTaskItems = toDisplayTaskItems(tasks, 'Task');
  const tomorrowWindowTasks = selectTomorrowWindowTasks(rankedTomorrowTasks, intelligenceContext);
  const tomorrowTaskItems = toDisplayTaskItems(tomorrowWindowTasks, 'Tomorrow');
  const todayBlend = blendTaskAndEventItems(todayTaskItems, calendarTodayItems, overdueTaskItems.slice(0, 2), 8);

  const spotlightTask = rankedTodayTasks[0] || signals.map(signalToItem)[0] || undatedTasks[0] || null;

  return {
    all: tasks,
    allItems: allTaskItems,
    todayTasks: todayTaskItems,
    todayBlend,
    overdueTasks: overdueTaskItems,
    upcomingTasks: upcomingTaskItems,
    inMotionTasks: inMotionTaskItems,
    tomorrowTasks: tomorrowTaskItems,
    rankedTodayTasks,
    rankedTomorrowTasks,
    calendarTodayItems,
    calendarTomorrowItems,
    allEventItems: [...calendarTodayItems, ...calendarTomorrowItems],
    spotlightTask: spotlightTask ? toDisplayTaskItems([spotlightTask], spotlightTask.kind || 'Task')[0] : null,
    counts: {
      all: tasks.length,
      today: todayTasks.length,
      overdue: overdueTasks.length,
      upcoming: upcomingTasks.length,
      inMotion: inMotionTasks.length,
      undated: undatedTasks.length,
      eventsToday: calendarTodayItems.length,
      tomorrow: tomorrowOnlyTasks.length,
    },
  };
}

function blendTaskAndEventItems(taskItems, eventItems, extraItems = [], maxItems = 8) {
  const blended = [];
  const seen = new Set();
  const pushUnique = (item) => {
    if (!item || blended.length >= maxItems) return;
    const key = getDisplayItemKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    blended.push(item);
  };

  const maxLen = Math.max(taskItems.length, eventItems.length);
  for (let i = 0; i < maxLen; i += 1) {
    pushUnique(taskItems[i]);
    pushUnique(eventItems[i]);
    if (blended.length >= maxItems) break;
  }
  for (const item of extraItems) {
    if (blended.length >= maxItems) break;
    pushUnique(item);
  }
  return blended.slice(0, maxItems);
}


function isTaskExcluded(task) {
  if (!task) return true;
  const panel = String(task.panel || '').toLowerCase();
  const status = String(task.status || '').toLowerCase();
  const completedField = appState.config.taskCompletedField;
  const completedValue = task[completedField];

  const isTruthy = (value) => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

  return (
    panel === 'done' ||
    panel === 'archived' ||
    status === 'done' ||
    status === 'completed' ||
    status === 'archived' ||
    !!task.completed_at ||
    !!task.archived_at ||
    isTruthy(task.archived) ||
    isTruthy(task.done) ||
    isTruthy(task.is_done) ||
    isTruthy(task.is_completed) ||
    isTruthy(completedValue)
  );
}

function normalizeTaskRows() {
  const dateField = appState.config.taskDateField;
  const titleField = appState.config.taskTitleField;
  const ownerField = appState.config.taskOwnerField;
  const actor = guessActor();

  return appState.tasks
    .filter((task) => !isTaskExcluded(task))
    .map((task) => {
      const dueDate = normalizeDate(task[dateField] || task.due_text || task.due_date || task.due, task.created_at);
      const owner = task[ownerField] || '';
      return {
        id: task.id,
        title: String(task[titleField] || 'Untitled task'),
        owner,
        dueDate,
        dueText: task[dateField] || task.due_text || task.due_date || task.due || '',
        tag: task.tag || '',
        recurrence: task.recurrence || '',
        description: task.description || '',
        panel: task.panel || '',
        raw: task,
        kind: 'Task',
        sortScore: dueDate ? dueDate.getTime() : Number.MAX_SAFE_INTEGER,
        isMine: owner ? String(owner).toLowerCase() === actor.toLowerCase() : false,
      };
    })
    .sort((a, b) => {
      if (a.sortScore !== b.sortScore) return a.sortScore - b.sortScore;
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
}


function normalizeOwnerKey(owner) {
  const value = String(owner || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'wes') return 'wes';
  if (value === 'skye') return 'skye';
  return 'shared';
}

function taskRowClass(task, armed = false) {
  const classes = ['task-list-item'];
  const bucket = getTaskDueBucket(task, getNowDate());
  classes.push(`task-bucket-${bucket}`);
  if (armed) classes.push('task-armed');
  return classes.join(' ');
}

function toDisplayTaskItems(tasks, fallbackPill = 'Task') {
  return tasks.map((task) => {
    if (task.signal_type || task.severity) return signalToItem(task);
    const dueMeta = task.dueDate ? formatTaskTiming(task.dueDate) : (task.dueText || 'No due date');
    const owner = task.owner || '';
    const canComplete = !!task.id && !pendingTaskCompletions.has(task.id);
    const armed = canComplete && isTaskCompletionArmed(task.id);
    return {
      id: task.id,
      itemKey: `task:${task.id || task.title}`,
      title: task.title,
      meta: [owner, armed ? 'Ready to complete' : dueMeta].filter(Boolean).join(' · '),
      pill: armed ? 'Ready' : (task.dueDate && task.dueDate < startOfDay(getNowDate()) ? 'Overdue' : task.dueDate && isSameDay(task.dueDate, getNowDate()) ? 'Today' : fallbackPill),
      pillClass: armed ? 'warning' : (task.dueDate && task.dueDate < startOfDay(getNowDate()) ? 'danger' : ''),
      ownerKey: normalizeOwnerKey(owner),
      emphasis: armed ? 'armed' : (task.dueDate && task.dueDate < startOfDay(getNowDate()) ? 'high' : task.dueDate && isSameDay(task.dueDate, getNowDate()) ? 'medium' : 'normal'),
      rowClass: taskRowClass(task, armed),
      actionHint: canComplete ? (armed ? 'Tap again to complete' : 'Tap once to arm completion') : '',
      onActivate: canComplete ? () => completeTask(task.raw || task) : null,
    };
  });
}

function buildKitchenHeadline(digest) {
  const parts = [];
  if (digest.counts.today) parts.push(`${digest.counts.today} tasks today`);
  if (digest.counts.eventsToday) parts.push(`${digest.counts.eventsToday} events`);
  if (digest.counts.overdue) parts.push(`${digest.counts.overdue} overdue`);
  if (!parts.length) parts.push(`${digest.counts.all} open tasks`);
  return parts.join(' · ');
}


function buildSignalEvalContext(now = getNowDate()) {
  return {
    now,
    day: now.getDay(),
    hour: now.getHours(),
    signalRules: normalizeSignalRules(getEffectiveSignalRules()),
    calendarTomorrowItems: getCalendarTomorrowItems(),
  };
}

function getCalendarTomorrowItems() {
  const snapshot = getSnapshotPayload(appState.config.calendarTomorrowSnapshotType);
  return Array.isArray(snapshot?.items) ? snapshot.items : [];
}

function buildTomorrowEventSignal(rules = getEffectiveSignalRules(), context = buildSignalEvalContext()) {
  const tomorrowRules = normalizeSignalRules(rules).tomorrowEvent;
  if (!tomorrowRules.enabled) return null;
  if (context.hour < tomorrowRules.startHour) return null;
  const items = context.calendarTomorrowItems || [];
  if (items.length < tomorrowRules.minEvents) return null;
  const lead = items[0] || {};
  const title = items.length > 1 ? 'Big event tomorrow' : 'Event tomorrow';
  const description = [lead.title, lead.time].filter(Boolean).join(' · ') || `${items.length} event${items.length === 1 ? '' : 's'} tomorrow`;
  return {
    id: 'synthetic-big-event-tomorrow',
    signal_type: 'big_event_tomorrow',
    title,
    description,
    severity: items.length > 1 ? 'warning' : 'notice',
    location: 'calendar',
    metadata: { synthetic: true, rule: 'tomorrow_event_preview', visible_in: ['tv', 'bedroom', 'kitchen'] },
  };
}

function activeDbSignals(now = getNowDate()) {
  return appState.signals.filter((signal) => !signal.expires_at || new Date(signal.expires_at) > now);
}

function didLogEventToday(eventType, now = getNowDate()) {
  return appState.logs.some((log) => {
    if (log.event_type !== eventType || !log.created_at) return false;
    const created = new Date(log.created_at);
    return isSameDay(created, now);
  });
}

function evaluateBinsSignal(rule, context) {
  const binsReminderWindow = rule.enabled && context.day === rule.dayOfWeek && context.hour >= rule.startHour;
  const binsDoneToday = didLogEventToday('bins_out', context.now);
  if (!binsReminderWindow || binsDoneToday) return null;
  const dayLabel = DAY_OPTIONS.find(([value]) => Number(value) === Number(rule.dayOfWeek))?.[1] || 'Reminder';
  const warning = context.hour >= rule.escalateHour;
  return {
    id: `synthetic-bins-${rule.dayOfWeek}`,
    signal_type: 'bins_weekly',
    title: 'Put bins out tonight',
    description: warning ? `${dayLabel} night reminder · bins still need to go to the street.` : `${dayLabel} reminder · bins need to go to the street tonight.`,
    severity: warning ? 'warning' : 'notice',
    location: rule.location || 'outside',
    metadata: { synthetic: true, rule: 'weekly_bins', visible_in: ['tv', 'bedroom', 'kitchen'] },
  };
}

function evaluateCustomSignalRule(rule, context) {
  if (!rule.enabled || !rule.name) return null;
  const scheduleDayMatch = rule.scheduleType === 'daily' ? true : context.day === rule.dayOfWeek;
  const afterStart = context.hour >= rule.startHour;
  const beforeEnd = rule.endHour === null || context.hour <= rule.endHour;
  if (!(scheduleDayMatch && afterStart && beforeEnd)) return null;
  if (rule.clearMode === 'log_event_today' && rule.ackEventType && didLogEventToday(rule.ackEventType, context.now)) return null;
  const isWarning = rule.escalateToWarning && context.hour >= rule.escalateHour;
  const descriptionParts = [];
  const timeWindowLabel = rule.endHour === null ? `from ${formatHourLabel(rule.startHour)}` : `${formatHourLabel(rule.startHour)}–${formatHourLabel(rule.endHour)}`;
  if (rule.scheduleType === 'weekly') {
    descriptionParts.push(`${DAY_OPTIONS.find(([value]) => Number(value) === Number(rule.dayOfWeek))?.[1] || 'Weekly'} ${timeWindowLabel}`);
  } else {
    descriptionParts.push(`Daily ${timeWindowLabel}`);
  }
  if (rule.clearMode === 'log_event_today' && rule.ackEventType) descriptionParts.push(`ack with ${rule.ackEventType}`);
  return {
    id: `synthetic-custom-${rule.id}`,
    signal_type: 'custom_rule',
    title: rule.name,
    description: descriptionParts.join(' · '),
    severity: isWarning ? 'warning' : 'notice',
    location: rule.location || 'custom',
    metadata: { synthetic: true, rule: 'custom_signal', customRuleId: rule.id },
  };
}

function evaluateLaundrySignals(rule) {
  if (!rule.enabled) return [];
  const activeLoads = appState.loads.filter((load) => !load.archived_at && load.status !== 'done');
  if (!activeLoads.length) return [];
  const readyCount = activeLoads.filter((load) => load.status === 'ready').length;
  const dryingCount = activeLoads.filter((load) => load.status === 'drying').length;
  const washingCount = activeLoads.filter((load) => load.status === 'washing').length;
  const detailParts = [];
  if (washingCount) detailParts.push(`${washingCount} washing`);
  if (dryingCount) detailParts.push(`${dryingCount} drying`);
  if (readyCount) detailParts.push(`${readyCount} ready`);
  return [{
    id: 'synthetic-laundry-active',
    signal_type: 'laundry_active',
    title: activeLoads.length === 1 ? 'Laundry load in progress' : 'Laundry in progress',
    description: detailParts.join(' · ') || `${activeLoads.length} active load${activeLoads.length === 1 ? '' : 's'}`,
    severity: readyCount ? 'warning' : 'notice',
    location: 'laundry',
    metadata: { synthetic: true, rule: 'laundry_active' },
  }];
}

function buildSyntheticRuleSignals(rules = getEffectiveSignalRules(), context = buildSignalEvalContext()) {
  const normalizedRules = normalizeSignalRules(rules);
  const items = [];
  const binsSignal = evaluateBinsSignal(normalizedRules.bins, context);
  if (binsSignal) items.push(binsSignal);
  const tomorrowEventSignal = buildTomorrowEventSignal(normalizedRules, context);
  if (tomorrowEventSignal) items.push(tomorrowEventSignal);
  return items;
}

function buildSyntheticCustomSignals(rules = getEffectiveSignalRules(), context = buildSignalEvalContext()) {
  const normalizedRules = normalizeSignalRules(rules);
  return normalizedRules.custom.map((rule) => evaluateCustomSignalRule(rule, context)).filter(Boolean);
}

function buildSyntheticLaundrySignals(rules = getEffectiveSignalRules()) {
  const normalizedRules = normalizeSignalRules(rules);
  return evaluateLaundrySignals(normalizedRules.laundry);
}


function dedupeSignals(signals = []) {
  const seen = new Set();
  const items = [];
  for (const signal of signals || []) {
    if (!signal) continue;
    const key = signal.id || `${signal.signal_type || 'signal'}|${signal.title || ''}|${signal.description || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(signal);
  }
  return items;
}

function scoreSignalPriority(signal, options = {}) {
  if (!signal) return -Infinity;
  const metadata = signal.metadata || {};
  if (Number.isFinite(metadata.priorityScore)) return metadata.priorityScore;

  const severityBase = { warning: 90, notice: 60, info: 25 };
  let score = severityBase[String(signal.severity || 'info').toLowerCase()] ?? 20;
  const type = String(signal.signal_type || '');
  const location = String(signal.location || '');

  if (signal.related_task_id) score += 18;
  if (metadata.synthetic) score += 6;
  if (location === 'tasks') score += 8;
  if (location === 'system') score += 4;
  if (type === 'laundry_active') score += 10;
  if (type === 'big_event_tomorrow') score += 12;
  if (type === 'derived_backlog_pressure') score += 16;
  if (type === 'derived_overdue_pressure') score += 8;
  if (type === 'derived_stale_tasks' && String(signal.severity || '').toLowerCase() === 'warning') score += 10;
  if (type === 'derived_all_clear') score -= 40;
  return score;
}



function chooseVisibleDerivedSignals(items = [], options = {}) {
  const now = options?.now || getNowDate();
  return selectDerivedSignalWithMemory(items, now);
}

function summarizeOwnerPressure(tasks = []) {
  const counts = new Map();
  for (const task of tasks || []) {
    const owner = String(task?.owner || '').trim();
    if (!owner) continue;
    counts.set(owner, (counts.get(owner) || 0) + 1);
  }
  let topOwner = '';
  let topCount = 0;
  for (const [owner, count] of counts.entries()) {
    if (count > topCount) {
      topOwner = owner;
      topCount = count;
    }
  }
  const totalOwned = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  const dominant = topOwner && topCount >= 2 && topCount >= Math.ceil((tasks || []).length / 2);
  return {
    topOwner,
    topCount,
    totalOwned,
    dominant,
  };
}

function formatOwnerPressureSuffix(summary) {
  if (!summary?.dominant || !summary?.topOwner) return '';
  return ` Mostly ${summary.topOwner}'s items.`;
}


function buildDerivedTaskSignals(tasks = normalizeTaskRows(), context = buildSignalEvalContext(), baseSignals = []) {
  const items = [];
  const now = context?.now || getNowDate();
  const overdueTasks = tasks.filter((task) => getTaskDueBucket(task, now) === 'overdue');
  const todayTasks = tasks.filter((task) => getTaskDueBucket(task, now) === 'today');
  const tomorrowTasks = tasks.filter((task) => getTaskDueBucket(task, now) === 'tomorrow');
  const inMotionTasks = tasks.filter((task) => String(task.panel || '').toLowerCase() === 'in motion');
  const hasOtherSignals = Array.isArray(baseSignals) && baseSignals.length > 0;
  const hasDbSignals = activeDbSignals(now).length > 0;
  const freshnessItems = getDataFreshnessItems();
  const taskFreshness = freshnessItems.find((item) => item.title === 'Tasks');
  const tasksAreStale = taskFreshness && ['Stale', 'Aging'].includes(String(taskFreshness.pill || ''));
  const oldestOverdueDays = overdueTasks.reduce((maxDays, task) => {
    if (!task?.dueDate) return maxDays;
    const diffDays = Math.max(1, Math.floor((startOfDay(now).getTime() - startOfDay(task.dueDate).getTime()) / 86400000));
    return Math.max(maxDays, diffDays);
  }, 1);
  const overdueOwnerSummary = summarizeOwnerPressure(overdueTasks);
  const todayOwnerSummary = summarizeOwnerPressure(todayTasks);
  const inMotionOwnerSummary = summarizeOwnerPressure(inMotionTasks);

  if (tasksAreStale) {
    const isStale = taskFreshness.pill === 'Stale';
    items.push({
      id: `derived-stale-tasks-${String(taskFreshness.pill || '').toLowerCase()}`,
      signal_type: 'derived_stale_tasks',
      title: isStale ? 'Display may be stale' : 'Live data is aging',
      description: taskFreshness.meta || 'Task data has not refreshed recently',
      severity: isStale ? 'warning' : 'notice',
      location: 'system',
      metadata: {
        synthetic: true,
        derived: true,
        rule: 'derived_stale_tasks',
        visible_in: ['tv', 'bedroom', 'kitchen', 'mobile'],
        priorityScore: isStale ? 142 : 108,
      },
    });
  }

  if (overdueTasks.length >= 2 && inMotionTasks.length >= 4) {
    const combinedPriority = 118 + (overdueTasks.length * 8) + (inMotionTasks.length * 4) + (oldestOverdueDays * 3);
    const tomorrowHint = tomorrowTasks.length >= 3 ? ` Tomorrow also has ${tomorrowTasks.length} item${tomorrowTasks.length === 1 ? '' : 's'} queued.` : '';
    items.push({
      id: `derived-backlog-pressure-${overdueTasks.length}-${inMotionTasks.length}-${oldestOverdueDays}`,
      signal_type: 'derived_backlog_pressure',
      title: 'Work is starting to back up',
      description: `${overdueTasks.length} overdue and ${inMotionTasks.length} in motion.${formatOwnerPressureSuffix(overdueOwnerSummary)}${tomorrowHint}`.trim(),
      severity: overdueTasks.length >= 3 || oldestOverdueDays >= 3 || inMotionTasks.length >= 6 ? 'warning' : 'notice',
      location: 'tasks',
      metadata: {
        synthetic: true,
        derived: true,
        rule: 'derived_backlog_pressure',
        visible_in: ['tv', 'bedroom', 'kitchen', 'mobile'],
        priorityScore: combinedPriority,
      },
    });
  }

  if (overdueTasks.length) {
    const overduePriority = 96 + (overdueTasks.length * 10) + (oldestOverdueDays * 5);
    const ownerSuffix = formatOwnerPressureSuffix(overdueOwnerSummary);
    items.push({
      id: `derived-overdue-${overdueTasks.length}-${oldestOverdueDays}`,
      signal_type: 'derived_overdue_pressure',
      title: overdueTasks.length === 1 ? 'Overdue task needs attention' : `${overdueTasks.length} overdue tasks`,
      description: overdueTasks.length === 1
        ? `${overdueTasks[0]?.title || 'Task'} is overdue`
        : `Oldest item is ${oldestOverdueDays} day${oldestOverdueDays === 1 ? '' : 's'} overdue.${ownerSuffix}`.trim(),
      severity: overdueTasks.length >= 2 || oldestOverdueDays >= 3 ? 'warning' : 'notice',
      location: 'tasks',
      metadata: {
        synthetic: true,
        derived: true,
        rule: 'derived_overdue_pressure',
        visible_in: ['tv', 'bedroom', 'kitchen', 'mobile'],
        priorityScore: overduePriority,
      },
    });
  }

  if (todayTasks.length >= 7) {
    const isVeryFull = todayTasks.length >= 10;
    const ownerSuffix = formatOwnerPressureSuffix(todayOwnerSummary);
    items.push({
      id: `derived-today-load-${todayTasks.length}`,
      signal_type: 'derived_today_load',
      title: isVeryFull ? 'Very full day' : 'Heavy day',
      description: `${todayTasks.length} tasks are due today.${ownerSuffix}`.trim(),
      severity: isVeryFull ? 'warning' : 'notice',
      location: 'tasks',
      metadata: {
        synthetic: true,
        derived: true,
        rule: 'derived_today_load',
        visible_in: ['tv', 'bedroom', 'kitchen', 'mobile'],
        priorityScore: (isVeryFull ? 94 : 72) + todayTasks.length,
      },
    });
  }

  if (inMotionTasks.length >= 5) {
    const inMotionPriority = 62 + (inMotionTasks.length * 5) + (overdueTasks.length ? 18 : 0);
    const ownerSuffix = formatOwnerPressureSuffix(inMotionOwnerSummary);
    items.push({
      id: `derived-in-motion-${inMotionTasks.length}`,
      signal_type: 'derived_in_motion_pressure',
      title: 'A lot is already in motion',
      description: `${inMotionTasks.length} tasks are currently in motion.${ownerSuffix}`.trim(),
      severity: inMotionTasks.length >= 7 ? 'warning' : 'notice',
      location: 'tasks',
      metadata: {
        synthetic: true,
        derived: true,
        rule: 'derived_in_motion_pressure',
        visible_in: ['tv', 'bedroom', 'kitchen', 'mobile'],
        priorityScore: inMotionPriority,
      },
    });
  }

  if (!overdueTasks.length && !todayTasks.length && !hasDbSignals && !hasOtherSignals) {
    items.push({
      id: 'derived-all-clear',
      signal_type: 'derived_all_clear',
      title: 'All clear',
      description: tasks.length ? 'No tasks are due today or overdue' : 'No active tasks or reminders right now',
      severity: 'info',
      location: 'system',
      metadata: {
        synthetic: true,
        derived: true,
        rule: 'derived_all_clear',
        visible_in: ['tv', 'bedroom', 'kitchen', 'mobile'],
        priorityScore: 5,
      },
    });
  }

  return chooseVisibleDerivedSignals(items, { now });
}

function buildSyntheticSignals(rules = getEffectiveSignalRules(), context = buildSignalEvalContext()) {
  const normalizedRules = normalizeSignalRules(rules);
  const baseSignals = [
    ...evaluateLaundrySignals(normalizedRules.laundry),
    ...buildSyntheticRuleSignals(normalizedRules, context),
    ...buildSyntheticCustomSignals(normalizedRules, context),
  ];
  const derivedSignals = buildDerivedTaskSignals(normalizeTaskRows(), context, baseSignals);
  return dedupeSignals([...baseSignals, ...derivedSignals]);
}

function sortSignalsForDisplay(signals = [], options = {}) {
  return [...signals].sort((a, b) => {
    const scoreDelta = scoreSignalPriority(b, options) - scoreSignalPriority(a, options);
    if (scoreDelta) return scoreDelta;
    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
}

function activeSignals(rules = getEffectiveSignalRules(), context = buildSignalEvalContext()) {
  return sortSignalsForDisplay(dedupeSignals([
    ...activeDbSignals(context.now),
    ...buildSyntheticSignals(rules, context),
  ]).filter((signal) => !isSignalLocallySnoozed(signal, context.now)), { now: context.now });
}

function buildForgetItems() {
  const digest = buildTaskDigest();
  const signals = activeSignals();
  const tomorrowItems = buildTomorrowItemsFromDigest(digest);
  return buildForgetItemsFromSignals(signals, tomorrowItems, digest);
}

function buildForgetItemsFromSignals(signals, tomorrowItems = [], digest = null) {
  const items = [];
  const seen = new Set();
  const pushUnique = (item) => {
    if (!item || items.length >= 4) return;
    const key = getDisplayItemKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  // Keep Don’t Forget distinct from Needs Attention.
  // This panel is now for gentle forward-looking reminders, not active signals.
  for (const item of (tomorrowItems || []).slice(0, 3)) pushUnique(item);
  for (const item of (digest?.upcomingTasks || []).slice(0, 3)) pushUnique(item);

  return items.slice(0, 4);
}

function buildSoftFocus() {
  const digest = buildTaskDigest();
  const signals = activeSignals();
  return buildSoftFocusFromDigest(digest, signals);
}

function buildSoftFocusFromDigest(digest, signals = []) {
  if (digest?.spotlightTask) return digest.spotlightTask;
  const topSignal = signals[0];
  if (topSignal) return { title: topSignal.title, meta: topSignal.description || 'Gentle attention item' };
  return null;
}

function buildTomorrowItems() {
  const digest = buildTaskDigest();
  return buildTomorrowItemsFromDigest(digest);
}

function buildTomorrowItemsFromDigest(digest) {
  const snapshot = getSnapshotPayload(appState.config.calendarTomorrowSnapshotType);
  const taskItems = digest?.tomorrowTasks?.slice(0, 4) || [];
  const events = Array.isArray(snapshot?.items)
    ? snapshot.items.slice(0, 3).map((item) => ({ title: item.title, meta: [item.sourceLabel || 'Calendar', item.time].filter(Boolean).join(' · '), pill: 'Calendar' }))
    : [];

  return blendTaskAndEventItems(taskItems, events, [], 5);
}

function signalToItem(signal) {
  const severity = signal.severity || 'info';
  return {
    title: signal.title,
    meta: signal.description || signal.location || '',
    pill: capitalize(severity),
    pillClass: severity === 'warning' ? 'warning' : severity === 'notice' ? 'notice' : '',
    rowClass: `signal-list-item signal-severity-${severity}`,
    emphasis: severity === 'warning' ? 'high' : severity === 'notice' ? 'medium' : 'normal',
    raw: signal,
  };
}

function logToItem(log) {
  return {
    title: prettifyEventType(log.event_type),
    meta: [log.actor, relativeTime(log.created_at)].filter(Boolean).join(' · '),
    pill: log.location ? capitalize(log.location) : '',
  };
}


function ensureToastHost() {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.append(host);
  }
  return host;
}

function showToast(message, type = 'info', options = {}) {
  const host = ensureToastHost();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  host.append(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  const duration = Math.max(900, Number(options.durationMs) || 1700);
  window.setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    window.setTimeout(() => toast.remove(), 220);
  }, duration);
}

function pulseButton(button) {
  if (!button) return;
  button.classList.remove('quick-button-hit');
  void button.offsetWidth;
  button.classList.add('quick-button-hit');
}

function upsertLocalLoad(load) {
  if (!load || !load.id) return;
  const loads = Array.isArray(appState.loads) ? [...appState.loads] : [];
  const idx = loads.findIndex((item) => item && item.id === load.id);
  if (idx >= 0) {
    loads[idx] = { ...loads[idx], ...load };
  } else {
    loads.unshift(load);
  }
  appState.loads = sortLoads(loads);
}

function removeLocalLoad(loadId) {
  if (!loadId) return;
  appState.loads = (appState.loads || []).filter((item) => item && item.id !== loadId);
}

function renderAfterLocalLoadChange() {
  renderRuntimeUi({ renderDevConsole: false });
}

function buildTaskCompletionPayload(task) {
  const payload = {
    panel: 'done',
    completed_at: new Date().toISOString(),
  };
  const completedField = String(appState.config.taskCompletedField || '').trim();
  if (completedField && completedField !== 'completed' && task && Object.prototype.hasOwnProperty.call(task, completedField)) {
    payload[completedField] = appState.config.useStringCompleted
      ? appState.config.taskCompletedValue
      : true;
  }
  return payload;
}

function removeLocalTask(taskId) {
  if (!taskId) return null;
  const previous = (appState.tasks || []).find((task) => task && task.id === taskId) || null;
  appState.tasks = (appState.tasks || []).filter((task) => task && task.id !== taskId);
  return previous;
}

function restoreLocalTask(task) {
  if (!task || !task.id) return;
  const existing = (appState.tasks || []).find((item) => item && item.id === task.id);
  if (existing) return;
  appState.tasks = [task, ...(appState.tasks || [])];
}

async function completeTask(task) {
  const taskId = task?.id;
  if (!taskId || pendingTaskCompletions.has(taskId)) return;
  if (taskIsArchived(task) || taskIsCompleted(task)) return;

  if (!isTaskCompletionArmed(taskId)) {
    armTaskCompletion(taskId);
    renderRuntimeUi({ renderDevConsole: false });
    showToast('Tap again to complete', 'info', { durationMs: TASK_COMPLETE_ARM_WINDOW_MS - 250 });
    setStatus(`Armed completion for ${task?.title || 'task'}. Tap again to confirm.`);
    return;
  }

  clearArmedTaskCompletion(taskId);
  const writeGuard = getRemoteWriteGuard('tasks');
  if (!writeGuard.allowed) {
    renderRuntimeUi({ renderDevConsole: false });
    showToast(writeGuard.reason || 'Live connection is degraded. Task not completed.', 'warning', { durationMs: 2400 });
    setStatus(`Blocked task completion: ${writeGuard.reason || 'write path not ready'}`);
    return;
  }

  pendingTaskCompletions.add(taskId);
  const previousTask = removeLocalTask(taskId) || task;
  renderRuntimeUi({ renderDevConsole: false });

  const payload = buildTaskCompletionPayload(previousTask);
  const ioStartedAt = startIoOperation('writes', 'tasks', 'completeTask');

  try {
    const { error } = await appState.supabase
      .from(appState.config.taskTable || 'tasks')
      .update(payload)
      .eq('id', taskId);
    if (error) throw error;
    finishIoOperation('writes', 'tasks', ioStartedAt, { ok: true, reason: 'completeTask' });
    showToast('Task completed', 'success');
    setStatus(`Completed: ${previousTask?.title || 'Task'}`);
  } catch (error) {
    finishIoOperation('writes', 'tasks', ioStartedAt, { ok: false, reason: 'completeTask', error: error?.message || String(error) });
    restoreLocalTask(previousTask);
    renderRuntimeUi({ renderDevConsole: false });
    console.error(error);
    showToast('Could not complete task — restored on screen', 'error', { durationMs: 2400 });
    setStatus(`Could not complete task: ${error.message}`);
  } finally {
    pendingTaskCompletions.delete(taskId);
  }
}

async function createQuickLog(item, button) {
  const writeGuard = getRemoteWriteGuard('household_logs');
  if (!writeGuard.allowed) {
    showToast(writeGuard.reason || 'Live connection is degraded. Log not saved.', 'warning', { durationMs: 2400 });
    setStatus(`Blocked quick log: ${writeGuard.reason || 'write path not ready'}`);
    return;
  }
  try {
    const actor = guessActor();
    const payload = {
      event_type: item.eventType,
      location: item.location,
      actor,
      source: appState.config.mode,
      details: {},
    };
    const { error } = await appState.supabase.from('household_logs').insert(payload);
    if (error) throw error;
    pulseButton(button);
    showToast(`${item.label} logged`, 'success');
    setStatus(`Logged: ${item.label}`);
  } catch (error) {
    console.error(error);
    showToast(`Could not log ${item.label.toLowerCase()}`, 'error');
    setStatus(`Could not log action: ${error.message}`);
  }
}

async function createLoad(button = null) {
  const writeGuard = getRemoteWriteGuard('laundry_loads');
  if (!writeGuard.allowed) {
    showToast(writeGuard.reason || 'Live connection is degraded. Load not started.', 'warning', { durationMs: 2400 });
    setStatus(`Blocked laundry action: ${writeGuard.reason || 'write path not ready'}`);
    return;
  }
  try {
    const payload = {
      label: null,
      status: 'washing',
      started_by: guessActor(),
      machine: 'washer',
      metadata: {},
    };
    const { data, error } = await appState.supabase.from('laundry_loads').insert(payload).select().single();
    if (error) throw error;
    if (data) {
      upsertLocalLoad(data);
      renderAfterLocalLoadChange();
    }
    pulseButton(button);
    showToast('Started new laundry load', 'success');
    setStatus('Started a new laundry load.');
  } catch (error) {
    console.error(error);
    showToast('Could not start laundry load', 'error');
    setStatus(`Could not start load: ${error.message}`);
  }
}

async function advanceLoad(load, button = null) {
  const writeGuard = getRemoteWriteGuard('laundry_loads');
  if (!writeGuard.allowed) {
    showToast(writeGuard.reason || 'Live connection is degraded. Load not updated.', 'warning', { durationMs: 2400 });
    setStatus(`Blocked laundry action: ${writeGuard.reason || 'write path not ready'}`);
    return;
  }
  try {
    const nextStatus = LOAD_STATUS_ORDER[Math.min(LOAD_STATUS_ORDER.indexOf(load.status) + 1, LOAD_STATUS_ORDER.length - 1)];
    const payload = {
      status: nextStatus,
      last_transition_at: new Date().toISOString(),
      completed_at: nextStatus === 'done' ? new Date().toISOString() : null,
      machine: nextStatus === 'drying' || nextStatus === 'ready' ? 'dryer' : 'washer',
    };
    const { error } = await appState.supabase.from('laundry_loads').update(payload).eq('id', load.id);
    if (error) throw error;
    upsertLocalLoad({ ...load, ...payload, id: load.id });
    renderAfterLocalLoadChange();
    pulseButton(button);
    showToast(`Moved load to ${capitalize(nextStatus)}`, 'success');
    setStatus(`Laundry load moved to ${nextStatus}.`);
  } catch (error) {
    console.error(error);
    showToast('Could not update laundry load', 'error');
    setStatus(`Could not update load: ${error.message}`);
  }
}

function setupVersionUi() {
  versionTag.textContent = APP_VERSION;
  versionTag.title = 'Long press to open developer console';
  versionTag.setAttribute('unselectable', 'on');
  versionTag.setAttribute('draggable', 'false');
  versionTag.style.userSelect = 'none';
  versionTag.style.webkitUserSelect = 'none';
  versionTag.style.webkitTouchCallout = 'none';
  versionTag.style.webkitTapHighlightColor = 'transparent';
}

function setupVersionBadgeLongPress() {
  let pressTimer = null;
  let longPressed = false;

  const clearSelection = () => {
    try {
      versionTag.blur();
      document.activeElement?.blur?.();
      if (window.getSelection) {
        const selection = window.getSelection();
        if (selection && typeof selection.removeAllRanges === 'function') selection.removeAllRanges();
      }
    } catch {}
  };

  const cancel = () => {
    clearTimeout(pressTimer);
    document.body.classList.remove('version-pressing');
    window.setTimeout(clearSelection, 0);
  };

  const start = (event) => {
    event.preventDefault();
    event.stopPropagation();
    longPressed = false;
    clearTimeout(pressTimer);
    document.body.classList.add('version-pressing');
    clearSelection();
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      toggleDevConsole(true);
      clearSelection();
      pushDevLog('info', 'Opened dev console from version badge long press.');
      if (navigator.vibrate) navigator.vibrate(20);
    }, 550);
  };

  versionTag.addEventListener('pointerdown', start, { passive: false });
  versionTag.addEventListener('pointerup', cancel);
  versionTag.addEventListener('touchstart', start, { passive: false });
  versionTag.addEventListener('touchend', cancel);
  versionTag.addEventListener('touchcancel', cancel);
  versionTag.addEventListener('pointermove', cancel);
  versionTag.addEventListener('pointerleave', cancel);
  versionTag.addEventListener('pointercancel', cancel);
  versionTag.addEventListener('contextmenu', (event) => event.preventDefault());
  versionTag.addEventListener('selectstart', (event) => event.preventDefault());
  versionTag.addEventListener('dragstart', (event) => event.preventDefault());
  versionTag.addEventListener('mousedown', (event) => event.preventDefault());
  versionTag.addEventListener('mouseup', clearSelection);
  versionTag.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
    if (longPressed) {
      longPressed = false;
    }
  });
}

let devConsoleEntries = [];
const DEV_CONSOLE_LIMIT = 250;

function setupDevConsole() {
  if (devConsoleLogEl) {
    devConsoleLogEl.style.userSelect = 'text';
    devConsoleLogEl.style.webkitUserSelect = 'text';
    devConsoleLogEl.style.webkitTouchCallout = 'default';
  }
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  function capture(level, args) {
    const rendered = args.map(renderConsoleArg).join(' ');
    devConsoleEntries.unshift({
      time: getNowDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      level,
      text: rendered,
    });
    devConsoleEntries = devConsoleEntries.slice(0, DEV_CONSOLE_LIMIT);
    renderDevConsole();
  }

  console.log = (...args) => { original.log(...args); capture('log', args); };
  console.info = (...args) => { original.info(...args); capture('info', args); };
  console.warn = (...args) => { original.warn(...args); capture('warn', args); };
  console.error = (...args) => { original.error(...args); capture('error', args); };

  window.addEventListener('error', (event) => {
    capture('error', [event.message, event.filename ? `@ ${event.filename}:${event.lineno}` : '']);
  });

  window.addEventListener('unhandledrejection', (event) => {
    capture('error', ['Unhandled promise rejection', event.reason]);
  });

  closeConsoleButton.onclick = (event) => { event.preventDefault(); hideDevConsole(); };
  clearConsoleButton.onclick = (event) => { event.preventDefault(); clearDevConsole(); };
  copyDiagnosticsButton.onclick = (event) => { event.preventDefault(); copyDiagnostics(); };
  if (testTimeInput) testTimeInput.value = appState.testTimeOverride ? currentDateInputValue() : '';
  if (setTestTimeButton) setTestTimeButton.onclick = (event) => { event.preventDefault(); applyTestTimeOverride(); };
  if (clearTestTimeButton) clearTestTimeButton.onclick = (event) => { event.preventDefault(); clearTestTimeOverride(); };
  console.info(`Household Command Center ${APP_VERSION} booting`);
}


function applyTestTimeOverride() {
  const raw = testTimeInput?.value?.trim();
  if (!raw) {
    showToast('Choose a test date and time first', 'error');
    return;
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    showToast('Invalid test date/time', 'error');
    return;
  }
  appState.testTimeOverride = parsed.toISOString();
  saveTestTimeOverride(appState.testTimeOverride);
  pushDevLog('info', `Set test time override to ${appState.testTimeOverride}`);
  showToast('Test time set', 'success');
  refreshAll('test time override set', { includeSlowState: true }).catch((error) => console.error('Refresh after setting test time failed', error));
  renderDevConsole();
}

function clearTestTimeOverride() {
  appState.testTimeOverride = null;
  saveTestTimeOverride(null);
  if (testTimeInput) testTimeInput.value = '';
  pushDevLog('info', 'Cleared test time override.');
  showToast('Returned to real time', 'success');
  refreshAll('test time override cleared', { includeSlowState: true }).catch((error) => console.error('Refresh after clearing test time failed', error));
  renderDevConsole();
}

function pushDevLog(level, message) {
  console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info'](message);
}

function renderConsoleArg(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toggleDevConsole(forceOpen = null) {
  if (forceOpen === true) devConsoleEl.classList.remove('hidden');
  else if (forceOpen === false) devConsoleEl.classList.add('hidden');
  else devConsoleEl.classList.toggle('hidden');
  renderDevConsole();
}

function hideDevConsole() {
  devConsoleEl.classList.add('hidden');
}

function clearDevConsole() {
  devConsoleEntries = [];
  renderDevConsole();
}

async function copyDiagnostics() {
  const payload = buildDiagnosticsText();
  try {
    await navigator.clipboard.writeText(payload);
    setStatus('Diagnostics copied to clipboard.');
  } catch (error) {
    console.error('Clipboard copy failed', error);
    setStatus('Could not copy diagnostics.');
  }
}

function buildDiagnosticsText() {
  const diag = {
    version: APP_VERSION,
    mode: appState.config.mode,
    deviceName: appState.config.deviceName,
    deviceKey: appState.deviceKey,
    location: appState.config.location,
    taskTable: appState.config.taskTable,
    taskFieldMapping: {
      title: appState.config.taskTitleField,
      owner: appState.config.taskOwnerField,
      dueDate: appState.config.taskDateField,
      completed: appState.config.taskCompletedField,
    },
    taskCount: appState.tasks.length,
    signalCount: appState.signals.length,
    loadCount: appState.loads.length,
    snapshotTypes: Object.keys(appState.snapshots),
    calendarAccounts: appState.calendarAccounts.map(account => ({ email: account.email, calendars: (account.calendars || []).filter(cal => cal.selected).length, expired: isCalendarAccountExpired(account) })),
    ioDiagnostics: appState.ioDiagnostics,
    serviceWorkerDiagnostics: appState.serviceWorkerDiagnostics,
    status: statusLine.textContent,
    time: getNowDate().toISOString(),
    testTimeOverride: appState.testTimeOverride,
  };
  const lines = [
    'Household Command Center Diagnostics',
    JSON.stringify(diag, null, 2),
    '',
    'Recent console entries:',
    ...devConsoleEntries.slice(0, 40).reverse().map((entry) => `[${entry.time}] ${entry.level.toUpperCase()} ${entry.text}`),
  ];
  return lines.join('\n');
}

function freshConnectionStatus() {
  return typeof structuredClone === 'function'
    ? structuredClone(DEFAULT_CONNECTION_STATUS)
    : JSON.parse(JSON.stringify(DEFAULT_CONNECTION_STATUS));
}

function setConnectionStatus(key, level, textValue) {
  appState.connectionStatus[key] = { level, text: textValue };
  renderConnectionStatusPanel();
}

function renderConnectionStatusPanel() {
  if (!connectionStatusGrid) return;
  const rows = [
    ['supabase', 'Supabase'],
    ['tasks', 'Tasks'],
    ['deviceProfile', 'Device profile'],
    ['realtime', 'Realtime'],
    ['serviceWorker', 'Service worker'],
  ];
  connectionStatusGrid.replaceChildren();
  for (const [key, label] of rows) {
    const state = appState.connectionStatus[key] || { level: 'unknown', text: 'Not tested' };
    const chip = document.createElement('div');
    chip.className = `status-chip ${state.level || 'unknown'}`;
    const title = document.createElement('span');
    title.textContent = label;
    const value = document.createElement('strong');
    value.textContent = state.text || 'Not tested';
    chip.append(title, value);
    connectionStatusGrid.append(chip);
  }
}

async function runConnectionTest() {
  appState.connectionStatus = freshConnectionStatus();
  renderConnectionStatusPanel();

  const config = readSettingsUi();
  if (!config.supabaseUrl || !config.supabaseKey) {
    setConnectionStatus('supabase', 'error', 'Missing URL or key');
    setConnectionStatus('tasks', 'unknown', 'Waiting for config');
    setConnectionStatus('deviceProfile', 'unknown', 'Waiting for config');
    setConnectionStatus('realtime', 'unknown', 'Waiting for config');
    pushDevLog('warn', 'Connection test skipped: missing Supabase URL/key.');
    return;
  }

  try {
    const supabaseLib = await waitForSupabaseGlobal();
    const client = supabaseLib.createClient(config.supabaseUrl, config.supabaseKey);
    setConnectionStatus('supabase', 'ok', 'Client initialized');

    let tasksOk = false;
    try {
      const { error } = await client.from(config.taskTable || 'tasks').select('id', { head: true, count: 'exact' }).limit(1);
      if (error) throw error;
      tasksOk = true;
      setConnectionStatus('tasks', 'ok', `Read ${config.taskTable || 'tasks'}`);
    } catch (error) {
      setConnectionStatus('tasks', 'error', error.message || 'Task query failed');
    }

    try {
      const { error } = await client.from('device_profiles').select('id', { head: true, count: 'exact' }).limit(1);
      if (error) throw error;
      setConnectionStatus('deviceProfile', 'ok', 'device_profiles readable');
    } catch (error) {
      setConnectionStatus('deviceProfile', 'error', error.message || 'device_profiles query failed');
    }

    if (tasksOk) {
      setConnectionStatus('realtime', 'ok', appState.subscriptions?.length ? getRealtimeStatusText() : 'Configured in app');
    } else {
      setConnectionStatus('realtime', 'warn', 'Check task access first');
    }
    pushDevLog('info', 'Connection test completed.');
  } catch (error) {
    setConnectionStatus('supabase', 'error', error?.message || 'Could not initialize client');
    setConnectionStatus('tasks', 'unknown', 'Not tested');
    syncServiceWorkerConnectionStatus();
    setConnectionStatus('deviceProfile', 'unknown', 'Not tested');
    setConnectionStatus('realtime', 'unknown', 'Not tested');
    pushDevLog('error', `Connection test failed: ${error?.message || error}`);
  }
}

function renderDevConsole() {
  const timeMeta = appState.testTimeOverride ? ` · test time ${new Date(appState.testTimeOverride).toLocaleString()}` : '';
  const activeCalendarCount = appState.calendarAccounts.reduce((sum, account) => sum + (account.calendars || []).filter(cal => cal.selected).length, 0);
  const eventCount = (appState.calendarDiagnostics.mergedToday || 0) + (appState.calendarDiagnostics.mergedTomorrow || 0);
  const io = appState.ioDiagnostics || {};
  const refreshes = io.refreshes || {};
  const timers = io.timers || {};
  devConsoleMetaEl.textContent = `${APP_VERSION} · ${appState.config.mode} · tasks ${appState.tasks.length} · signals ${appState.signals.length} · loads ${appState.loads.length} · calendars ${activeCalendarCount} · events ${eventCount} · full ${refreshes.full || 0} · targeted ${refreshes.targeted || 0} · poll ${timers.autoRefreshSeconds || 0}s${timeMeta}`;
  devConsoleLogEl.replaceChildren();
  for (const line of buildIoSummaryRows()) {
    const row = document.createElement('div');
    row.className = 'dev-console-entry info';
    row.textContent = `[IO] ${line}`;
    row.style.userSelect = 'text';
    row.style.webkitUserSelect = 'text';
    devConsoleLogEl.append(row);
  }
  if (!devConsoleEntries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No console entries yet.';
    devConsoleLogEl.append(empty);
    return;
  }
  for (const entry of devConsoleEntries) {
    const row = document.createElement('div');
    row.className = `dev-console-entry ${entry.level}`;
    row.textContent = `[${entry.time}] ${entry.level.toUpperCase()} ${entry.text}`;
    row.style.userSelect = 'text';
    row.style.webkitUserSelect = 'text';
    devConsoleLogEl.append(row);
  }
}

function setupSettingsUi() {
  fillSettingsForm();
  renderConnectionStatusPanel();
}

function fillSettingsForm() {
  document.getElementById('supabase-url').value = appState.config.supabaseUrl;
  document.getElementById('supabase-key').value = appState.config.supabaseKey;
  document.getElementById('device-name').value = appState.config.deviceName;
  document.getElementById('mode-select').value = appState.config.mode;
  document.getElementById('location-input').value = appState.config.location;
  document.getElementById('keep-screen-awake').checked = !!appState.config.keepScreenAwake;
  document.getElementById('task-date-field').value = appState.config.taskDateField;
  document.getElementById('task-owner-field').value = appState.config.taskOwnerField;
  document.getElementById('task-title-field').value = appState.config.taskTitleField;
  document.getElementById('task-completed-field').value = appState.config.taskCompletedField;
  document.getElementById('task-completed-value').value = appState.config.taskCompletedValue;
  document.getElementById('use-string-completed').checked = appState.config.useStringCompleted;
  document.getElementById('ui-refresh-seconds').value = appState.config.uiRefreshSeconds;
  if (googleClientIdInput) googleClientIdInput.value = appState.config.googleClientId || '';
  if (weatherLocationInput) weatherLocationInput.value = appState.config.weatherLocationQuery || '';
  renderCalendarAccounts();
  renderConnectionStatusPanel();
}

function readSettingsUi() {
  return {
    ...appState.config,
    supabaseUrl: document.getElementById('supabase-url').value.trim(),
    supabaseKey: document.getElementById('supabase-key').value.trim(),
    deviceName: document.getElementById('device-name').value.trim() || 'New device',
    mode: document.getElementById('mode-select').value,
    location: document.getElementById('location-input').value.trim(),
    keepScreenAwake: document.getElementById('keep-screen-awake').checked,
    taskDateField: document.getElementById('task-date-field').value.trim() || DEFAULT_CONFIG.taskDateField,
    taskOwnerField: document.getElementById('task-owner-field').value.trim() || DEFAULT_CONFIG.taskOwnerField,
    taskTitleField: document.getElementById('task-title-field').value.trim() || DEFAULT_CONFIG.taskTitleField,
    taskCompletedField: document.getElementById('task-completed-field').value.trim() || DEFAULT_CONFIG.taskCompletedField,
    taskCompletedValue: document.getElementById('task-completed-value').value.trim() || DEFAULT_CONFIG.taskCompletedValue,
    useStringCompleted: document.getElementById('use-string-completed').checked,
    uiRefreshSeconds: Math.max(15, Number(document.getElementById('ui-refresh-seconds').value) || DEFAULT_CONFIG.uiRefreshSeconds),
    googleClientId: googleClientIdInput?.value?.trim() || DEFAULT_CONFIG.googleClientId,
    weatherLocationQuery: weatherLocationInput?.value?.trim() || DEFAULT_CONFIG.weatherLocationQuery,
    weatherLocationName: appState.config.weatherLocationName || '',
    weatherLatitude: appState.config.weatherLatitude || '',
    weatherLongitude: appState.config.weatherLongitude || '',
    weatherTimezone: appState.config.weatherTimezone || '',
  };
}

function supportsScreenWakeLock() {
  return typeof navigator !== 'undefined' && !!(navigator.wakeLock && navigator.wakeLock.request);
}

function formatWakeLockAttemptTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function markWakeLockInteractionReady() {
  if (appState.wakeLockStatus?.needsInteraction) {
    updateWakeLockStatus({ needsInteraction: false, note: 'Retrying after interaction' });
  }
  syncWakeLock({ reason: 'user-interaction', force: true });
}

function wakeLockRecommendedForMode(mode = appState.config.mode) {
  return ['kitchen', 'laundry', 'bedroom'].includes(mode);
}

function desiredWakeLockEnabled() {
  return !!appState.config.keepScreenAwake;
}

function updateWakeLockStatus(patch = {}) {
  appState.wakeLockStatus = {
    ...appState.wakeLockStatus,
    ...patch,
    supported: supportsScreenWakeLock(),
    enabled: desiredWakeLockEnabled(),
  };
}

function getWakeLockLifecycleNote(reason = '', fallback = '') {
  if (!reason) return fallback || '';
  const labels = {
    'user-interaction': 'Retrying after interaction',
    lifecycle: 'Refreshing on focus/visibility return',
    released: 'Re-requesting after system release',
    'interval-retry': 'Periodic retry',
    settings: 'Refreshing after settings change',
    startup: 'Starting keep-awake manager',
    hidden: 'Paused while app is hidden',
    disabled: 'Disabled in settings',
  };
  return labels[reason] || fallback || reason;
}

function noteWakeLockLifecycle(reason = '', patch = {}) {
  updateWakeLockStatus({
    lastReason: reason || appState.wakeLockStatus?.lastReason || '',
    ...patch,
  });
}

async function releaseWakeLock(reason = '') {
  const sentinel = appState.wakeLockSentinel;
  appState.wakeLockSentinel = null;
  if (sentinel) {
    try { await sentinel.release(); } catch {}
  }
  updateWakeLockStatus({
    active: false,
    note: getWakeLockLifecycleNote(reason, reason || (desiredWakeLockEnabled() ? 'Released' : 'Disabled')),
    error: '',
    releasedAt: new Date().toISOString(),
    lastReason: reason || appState.wakeLockStatus?.lastReason || '',
  });
}

function queueWakeLockSync(reason = '') {
  window.setTimeout(() => {
    syncWakeLock({ reason, force: true });
  }, 250);
}

async function syncWakeLock(options = {}) {
  const reason = options.reason || '';
  const enabled = desiredWakeLockEnabled();
  noteWakeLockLifecycle(reason, { enabled, supported: supportsScreenWakeLock() });

  if (!enabled) {
    await releaseWakeLock('disabled');
    updateWakeLockStatus({ needsInteraction: false });
    return false;
  }
  if (!supportsScreenWakeLock()) {
    updateWakeLockStatus({ active: false, error: '', note: 'Not supported on this browser/device', needsInteraction: false, retryCount: 0 });
    return false;
  }
  if (document.hidden) {
    await releaseWakeLock('hidden');
    return false;
  }
  if (appState.wakeLockSentinel && !options.force) {
    updateWakeLockStatus({ active: true, error: '', note: 'Active', needsInteraction: false });
    return true;
  }

  if (appState.wakeLockSentinel && options.force) {
    try { await appState.wakeLockSentinel.release(); } catch {}
    appState.wakeLockSentinel = null;
  }

  try {
    const sentinel = await navigator.wakeLock.request('screen');
    appState.wakeLockSentinel = sentinel;
    sentinel.addEventListener('release', () => {
      appState.wakeLockSentinel = null;
      updateWakeLockStatus({
        active: false,
        note: document.hidden ? 'Paused while app is hidden' : 'Released by system',
        releasedAt: new Date().toISOString(),
      });
      if (!document.hidden && desiredWakeLockEnabled()) {
        queueWakeLockSync('released');
      }
      try { if (appState.config.mode === 'mobile') renderRuntimeUi({ renderDevConsole: false }); } catch {}
    });
    updateWakeLockStatus({ active: true, error: '', note: 'Active', needsInteraction: false, lastAttemptAt: new Date().toISOString(), retryCount: 0 });
    return true;
  } catch (error) {
    const message = error?.message || String(error || 'Wake lock request failed');
    const needsInteraction = /gesture|activation|interact|user/i.test(message);
    updateWakeLockStatus({
      active: false,
      error: message,
      note: needsInteraction ? 'Tap once to activate keep-awake' : 'Request failed',
      needsInteraction,
      lastAttemptAt: new Date().toISOString(),
      retryCount: (appState.wakeLockStatus?.retryCount || 0) + 1,
    });
    return false;
  }
}

function buildWakeLockDebugSummary() {
  const status = appState.wakeLockStatus || {};
  return {
    title: `Wake lock: ${status.active ? 'active' : (status.enabled ? 'enabled' : 'off')}`,
    meta: [
      status.lastReason ? `Last reason ${status.lastReason}` : '',
      status.lastAttemptAt ? `Attempt ${formatWakeLockAttemptTime(status.lastAttemptAt)}` : '',
      status.releasedAt ? `Release ${formatWakeLockAttemptTime(status.releasedAt)}` : '',
      status.retryCount ? `Retries ${status.retryCount}` : '',
    ].filter(Boolean).join(' · '),
    pill: 'Wake',
  };
}

function buildWakeLockStatusItems() {
  const status = appState.wakeLockStatus || {};
  const mode = appState.config.mode || 'tv';
  const items = [];
  const summaryTitle = status.active ? 'Screen wake lock is active' : (status.enabled ? 'Screen wake lock is enabled' : 'Screen wake lock is off');
  const summaryMeta = [
    `Mode ${mode}`,
    status.note || (status.supported ? 'Ready' : 'Use Guided Access or device settings as fallback'),
    status.lastAttemptAt ? `Last attempt ${formatWakeLockAttemptTime(status.lastAttemptAt)}` : '',
    !status.supported && wakeLockRecommendedForMode(mode) ? 'Best on modern Safari/Chrome PWAs' : '',
  ].filter(Boolean).join(' · ');
  items.push({
    title: summaryTitle,
    meta: summaryMeta,
    pill: status.active ? 'Active' : (status.enabled ? (status.needsInteraction ? 'Tap once' : (status.supported ? 'Pending' : 'Unavailable')) : 'Off'),
    pillClass: status.active ? '' : ((status.enabled && !status.supported) || status.needsInteraction ? 'warning' : ''),
  });
  if (status.needsInteraction) {
    items.push({ title: 'Needs one tap after opening', meta: 'Tap anywhere in the app once to help iPhone/iPad keep the screen awake.', pill: 'Tip', pillClass: 'warning' });
  }
  if (status.error) {
    items.push({ title: 'Last wake-lock error', meta: status.error, pill: 'Error', pillClass: 'warning' });
  }
  if (!status.enabled && wakeLockRecommendedForMode(mode)) {
    items.push({ title: 'Recommended for this mode', meta: 'Turn on “Keep screen awake” in Settings for a dedicated household display.', pill: 'Tip' });
  }
  return items;
}

function setupWakeLockHooks() {
  updateWakeLockStatus({});
  const retry = () => { syncWakeLock({ reason: 'lifecycle' }); };
  document.addEventListener('visibilitychange', retry);
  window.addEventListener('focus', retry);
  window.addEventListener('pageshow', retry);
  document.addEventListener('pointerdown', markWakeLockInteractionReady, { passive: true });
  document.addEventListener('touchstart', markWakeLockInteractionReady, { passive: true });
  document.addEventListener('click', markWakeLockInteractionReady, { passive: true });
  window.setInterval(() => {
    if (!document.hidden && desiredWakeLockEnabled() && !appState.wakeLockSentinel) {
      syncWakeLock({ reason: 'interval-retry' });
    }
  }, 30000);
  syncWakeLock({ reason: 'startup' });
  window.addEventListener('beforeunload', () => {
    try { appState.wakeLockSentinel?.release(); } catch {}
    appState.wakeLockSentinel = null;
  });
}

function setupButtons() {
  pushDevLog('info', 'Button handlers attached.');
  settingsButton.onclick = openSettingsDialog;
  if (trustIndicator) trustIndicator.onclick = () => { document.querySelector('.ambient-footer')?.scrollIntoView({ behavior: 'smooth', block: 'end' }); };
  refreshButton.onclick = async () => {
    try {
      await refreshAll('manual refresh button', { includeSlowState: true });
    } catch (error) {
      handleRuntimeActionError('Refresh failed', error);
    }
  };
  testConnectionButton.onclick = async () => {
    await runConnectionTest();
  };
  if (connectGoogleAccountButton) connectGoogleAccountButton.onclick = async (event) => {
    event.preventDefault();
    await connectGoogleCalendarAccount();
  };
  saveSettingsButton.onclick = async (event) => {
    event.preventDefault();
    const previousWeatherQuery = appState.config.weatherLocationQuery || '';
    appState.config = readSettingsUi();
    if ((appState.config.weatherLocationQuery || '') !== previousWeatherQuery) {
      appState.config.weatherLatitude = '';
      appState.config.weatherLongitude = '';
      appState.config.weatherTimezone = '';
      appState.config.weatherLocationName = '';
    }
    persistLocalConfig();
    fillSettingsForm();
    closeSettingsDialog();
    try {
      await syncWakeLock({ force: true });
      resetAutoRefreshTimer();
resetSlowStateBackstopTimer();
resetCalendarPublishTimer();
resetHousekeepingTimer();
      clearSubscriptions();
      await ensureSupabase();
      await upsertDeviceProfile();
      await refreshAll('settings saved', { includeSlowState: true });
      bindRealtime();
    } catch (error) {
      handleRuntimeActionError('Settings saved, but refresh failed', error);
    }
  };
}

async function upsertDeviceProfile() {
  if (!appState.supabase) return;
  const payload = buildDeviceProfilePayload();
  const { data, error } = await appState.supabase
    .from('device_profiles')
    .upsert(payload, { onConflict: 'device_key' })
    .select()
    .single();
  if (error) {
    setStatus(`Settings saved locally, but profile update failed: ${error.message}`);
    return;
  }
  appState.deviceProfile = data;
}


function openSettingsDialog() {
  try {
    fillSettingsForm();
    if (typeof settingsDialog.showModal === 'function') settingsDialog.showModal();
    else settingsDialog.setAttribute('open', 'open');
    runConnectionTest().catch((error) => pushDevLog('warn', `Connection panel test failed: ${error?.message || error}`));
  } catch (error) {
    handleRuntimeActionError('Could not open settings', error);
  }
}

function closeSettingsDialog() {
  try {
    if (typeof settingsDialog.close === 'function') settingsDialog.close();
    else settingsDialog.removeAttribute('open');
  } catch (error) {
    handleRuntimeActionError('Could not close settings', error);
  }
}

function handleRuntimeActionError(prefix, error) {
  console.error(error);
  setStatus(`${prefix}: ${error?.message || error}`);
}

function handleFatalStartupError(error) {
  try {
    window.__hccBootState.errors.push(String(error?.message || error));
    window.__hccBootState.phase = 'fatal-startup-error';
  } catch {}
  console.error('Fatal startup error', error);
  setStatus(`Startup error: ${error?.message || error}`);
  renderEmptyShell('Startup failed. Long-press the version badge for diagnostics, then open Settings and verify your Supabase URL/key and field mapping.');
  renderDevConsole();
}

function renderEmptyShell(message) {
  screenEl.className = 'screen single-column';
  const box = document.createElement('section');
  box.className = 'card';
  const text = document.createElement('div');
  text.className = 'empty-state';
  text.textContent = message;
  box.append(text);
  screenEl.replaceChildren(box);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE);
    return normalizeLocalConfig(raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG });
  } catch {
    return normalizeLocalConfig({ ...DEFAULT_CONFIG });
  }
}

function normalizeLocalConfig(config = {}) {
  const normalized = { ...DEFAULT_CONFIG, ...config };
  for (const key of DEVICE_PROFILE_CONFIG_KEYS) {
    if (normalized[key] == null) normalized[key] = DEFAULT_CONFIG[key];
  }
  for (const key of LOCAL_ONLY_CONFIG_KEYS) {
    if (normalized[key] == null) normalized[key] = DEFAULT_CONFIG[key];
  }
  normalized.signalRulesDraft = normalizeSignalRules(normalized.signalRulesDraft || DEFAULT_SIGNAL_RULES);
  normalized.googleClientId = String(normalized.googleClientId || '').trim();
  normalized.weatherLocationQuery = String(normalized.weatherLocationQuery || '').trim();
  normalized.weatherLocationName = cleanLocationName(String(normalized.weatherLocationName || '').trim());
  normalized.weatherLatitude = String(normalized.weatherLatitude || '').trim();
  normalized.weatherLongitude = String(normalized.weatherLongitude || '').trim();
  normalized.weatherTimezone = String(normalized.weatherTimezone || '').trim();
  normalized.uiRefreshSeconds = Math.max(15, Number(normalized.uiRefreshSeconds) || DEFAULT_CONFIG.uiRefreshSeconds);
  normalized.keepScreenAwake = !!normalized.keepScreenAwake;
  normalized.taskCompletedField = String(normalized.taskCompletedField || '').trim();
  if (normalized.taskCompletedField.toLowerCase() === 'completed') normalized.taskCompletedField = '';
  return normalized;
}

function persistLocalConfig() {
  appState.config = normalizeLocalConfig(appState.config);
  saveConfig(appState.config);
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_STORAGE, JSON.stringify(normalizeLocalConfig(config)));
}

function applyDeviceProfileToConfig(profile) {
  if (!profile || typeof profile !== 'object') return appState.config;
  appState.config.deviceName = profile.device_name || appState.config.deviceName;
  appState.config.mode = profile.mode || appState.config.mode;
  appState.config.location = profile.location || appState.config.location;
  if (typeof profile.settings?.keepScreenAwake === 'boolean') appState.config.keepScreenAwake = profile.settings.keepScreenAwake;
  return appState.config;
}

function buildDeviceProfilePayload(config = appState.config) {
  const source = normalizeLocalConfig(config);
  return {
    device_name: source.deviceName,
    device_key: appState.deviceKey,
    mode: source.mode,
    location: source.location,
    settings: { keepScreenAwake: !!source.keepScreenAwake },
    is_active: true,
  };
}

function applySharedWeatherConfig(weather) {
  if (!weather || typeof weather !== 'object') return;
  appState.config.weatherLocationQuery = String(weather.weatherLocationQuery || weather.locationQuery || appState.config.weatherLocationQuery || '').trim();
  appState.config.weatherLocationName = cleanLocationName(String(weather.weatherLocationName || weather.locationName || appState.config.weatherLocationName || '').trim());
  appState.config.weatherLatitude = String(weather.weatherLatitude || weather.latitude || appState.config.weatherLatitude || '').trim();
  appState.config.weatherLongitude = String(weather.weatherLongitude || weather.longitude || appState.config.weatherLongitude || '').trim();
  appState.config.weatherTimezone = String(weather.weatherTimezone || weather.timezone || appState.config.weatherTimezone || '').trim();
}

function applySharedCalendarConfig(sharedMap) {
  if (typeof sharedMap?.[SHARED_CONFIG_KEYS.googleClientId] === 'string' && sharedMap[SHARED_CONFIG_KEYS.googleClientId].trim()) {
    appState.config.googleClientId = sharedMap[SHARED_CONFIG_KEYS.googleClientId].trim();
  }
  const sharedAccounts = sharedMap?.[SHARED_CONFIG_KEYS.calendarAccounts];
  if (Array.isArray(sharedAccounts) && sharedAccounts.length) {
    const mergedAccounts = mergeSharedCalendarAccounts(sharedAccounts, appState.calendarAccounts || []);
    appState.calendarAccounts = mergedAccounts;
    try { localStorage.setItem(CALENDAR_ACCOUNTS_STORAGE, JSON.stringify(mergedAccounts)); } catch {}
  }
}

function applySharedSignalRulesConfig(sharedMap) {
  const sharedSignalRules = sharedMap?.[SHARED_CONFIG_KEYS.signalRules];
  appState.signalRulesDraft = normalizeSignalRules(sharedSignalRules || appState.config.signalRulesDraft || DEFAULT_SIGNAL_RULES);
  appState.config.signalRulesDraft = normalizeSignalRules(appState.signalRulesDraft);
}

function applySharedConfigToLocalState(sharedMap) {
  applySharedCalendarConfig(sharedMap);
  applySharedWeatherConfig(sharedMap?.[SHARED_CONFIG_KEYS.weather]);
  applySharedSignalRulesConfig(sharedMap);
  appState.config = normalizeLocalConfig(appState.config);
}

function getOrCreateDeviceKey() {
  const existing = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (existing) return existing;
  const key = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY_STORAGE, key);
  return key;
}

function setStatus(text) {
  statusLine.textContent = text;
  try { window.__hccBootState.statusText = text; } catch {}
}

function getPresentationPhase() {
  return isEvening() ? 'evening' : 'day';
}

function describeDateContext(context = null) {
  const weather = getSnapshotPayload(appState.config.weatherSnapshotType);
  if (context?.isEvening) return 'Tomorrow is now the main focus.';
  return weather ? formatWeatherSummary(weather, { includeTomorrow: !!context?.isEvening }) : getNowDate().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function getSharedConfigUpdatedAt(key) {
  return appState.sharedConfigMeta?.[key]?.updated_at || null;
}

function getSnapshotFreshnessState(snapshot, fallback = 'Live') {
  if (!snapshot) {
    return { level: 'warning', pill: 'Missing', pillClass: 'warning', metaLabel: '', isMissing: true, isStale: false };
  }
  const level = snapshotStatusLevel(snapshot);
  const isStale = !!(snapshot.valid_until && new Date(snapshot.valid_until) < getNowDate());
  let pill = fallback;
  if (isStale) pill = 'Stale';
  else if (level === 'warning') pill = 'Aging';
  else if (level === 'notice') pill = 'Recent';
  return {
    level,
    pill,
    pillClass: level === 'warning' ? 'warning' : (level === 'notice' ? 'notice' : ''),
    metaLabel: snapshotMetaLabel('', snapshot).replace(/^\s*·\s*/, ''),
    isMissing: false,
    isStale,
  };
}

function getCalendarPublisherSnapshot() {
  return getSnapshot(appState.config.calendarTodaySnapshotType) || getSnapshot(appState.config.calendarTomorrowSnapshotType);
}

function getCalendarServiceState() {
  const requirement = getCalendarAuthRequirementState();
  const publisherSnapshot = getCalendarPublisherSnapshot();
  const publisher = describeSnapshotPublisher(publisherSnapshot);
  const details = requirement.details.map((item, idx) => ({
    name: item.name || item.email || `Account ${idx + 1}`,
    status: item.connected ? 'Connected' : 'Needs reconnect',
  }));
  const items = requirement.totalRequired
    ? details.map((detail) => ({
        title: detail.name,
        meta: detail.status,
        pill: detail.status === 'Connected' ? 'Ready' : 'Reconnect',
        pillClass: detail.status === 'Connected' ? '' : 'warning',
      }))
    : [{
        title: 'No accounts connected on this device',
        meta: 'Open Mobile → Calendar to connect a Google account for calendar publishing.',
        pill: 'Setup',
        pillClass: 'warning',
      }];
  return {
    total: requirement.totalRequired,
    connected: requirement.connected,
    needsReconnect: requirement.needsReconnect,
    details,
    items,
    hasProblem: requirement.needsReconnect > 0 || requirement.totalRequired === 0,
    publisher,
    publisherSnapshot,
    publisherFreshness: getSnapshotFreshnessState(publisherSnapshot),
  };
}

function getWeatherServiceState() {
  const snapshot = getSnapshot(appState.config.weatherSnapshotType);
  const freshness = getSnapshotFreshnessState(snapshot);
  const locationLabel = cleanLocationName(appState.config.weatherLocationName || appState.config.weatherLocationQuery || 'No location configured');
  const items = snapshot?.payload ? [{
    title: formatWeatherSummary(snapshot.payload, { includeTomorrow: true }),
    meta: snapshotMetaLabel('Weather', snapshot),
    pill: freshness.pill,
    pillClass: freshness.pillClass,
  }] : [];
  return {
    snapshot,
    freshness,
    locationLabel,
    items,
    isConfigured: !!String(appState.config.weatherLocationQuery || appState.config.weatherLatitude || '').trim(),
  };
}

function buildCalendarSnapshotSource() {
  const label = String(appState.config.deviceName || appState.deviceKey || 'unknown-device').trim();
  return `calendar-publisher:${label}`;
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

function snapshotFreshnessPill(snapshot, fallback = 'Live') {
  return getSnapshotFreshnessState(snapshot, fallback).pill;
}

function snapshotFreshnessClass(snapshot) {
  return getSnapshotFreshnessState(snapshot).pillClass;
}

function getFreshnessDescriptorFromAgeMs(ageMs, thresholds = {}) {
  const freshMs = Number(thresholds.freshMs || 0);
  const agingMs = Number(thresholds.agingMs || freshMs || 0);
  if (!Number.isFinite(ageMs) || ageMs < 0) return { pill: 'Unknown', pillClass: 'warning', level: 'warning' };
  if (ageMs <= freshMs) return { pill: 'Fresh', pillClass: '', level: 'info' };
  if (ageMs <= agingMs) return { pill: 'Aging', pillClass: 'notice', level: 'notice' };
  return { pill: 'Stale', pillClass: 'warning', level: 'warning' };
}

function getDataFreshnessItems() {
  const reads = (appState.ioDiagnostics || {}).reads || {};
  const nowMs = getNowMs();

  const taskRead = reads.tasks || {};
  const realtime = appState.realtimeDiagnostics || {};
  const taskReferenceAt = realtime.lastEventAt || taskRead.lastFinishedAt || taskRead.lastStartedAt || '';
  const taskAgeMs = taskReferenceAt ? Math.max(0, nowMs - new Date(taskReferenceAt).getTime()) : Number.POSITIVE_INFINITY;
  const taskDesc = getFreshnessDescriptorFromAgeMs(taskAgeMs, { freshMs: 5 * 60 * 1000, agingMs: 20 * 60 * 1000 });
  if (taskRead.lastError || ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(String(realtime.lastStatus || '').toUpperCase())) {
    taskDesc.pill = 'Stale';
    taskDesc.pillClass = 'warning';
    taskDesc.level = 'warning';
  }

  const snapshots = [
    getSnapshot(appState.config.weatherSnapshotType),
    getSnapshot(appState.config.calendarTodaySnapshotType),
    getSnapshot(appState.config.calendarTomorrowSnapshotType),
  ].filter(Boolean);
  const snapshotStates = snapshots.map((snapshot) => getSnapshotFreshnessState(snapshot));
  let snapshotPill = 'Missing';
  let snapshotPillClass = 'warning';
  if (snapshotStates.length) {
    if (snapshotStates.some((state) => state.pill === 'Stale' || state.isMissing || state.level === 'warning')) {
      snapshotPill = 'Stale';
      snapshotPillClass = 'warning';
    } else if (snapshotStates.some((state) => state.pill === 'Aging' || state.level === 'notice')) {
      snapshotPill = 'Aging';
      snapshotPillClass = 'notice';
    } else {
      snapshotPill = 'Fresh';
      snapshotPillClass = '';
    }
  }

  const configRead = reads.householdConfig || {};
  const sharedUpdatedAts = Object.values(appState.sharedConfigMeta || {}).map((entry) => entry?.updated_at).filter(Boolean);
  const configReferenceAt = configRead.lastFinishedAt || sharedUpdatedAts.sort().slice(-1)[0] || '';
  const configAgeMs = configReferenceAt ? Math.max(0, nowMs - new Date(configReferenceAt).getTime()) : Number.POSITIVE_INFINITY;
  const configDesc = getFreshnessDescriptorFromAgeMs(configAgeMs, { freshMs: 15 * 60 * 1000, agingMs: 60 * 60 * 1000 });
  if (configRead.lastError) {
    configDesc.pill = 'Stale';
    configDesc.pillClass = 'warning';
    configDesc.level = 'warning';
  }

  return [
    {
      title: 'Tasks',
      meta: [
        taskReferenceAt ? `Checked ${relativeTime(taskReferenceAt)}` : 'No successful task read yet',
        taskRead.lastDurationMs ? `${taskRead.lastDurationMs} ms` : '',
        taskRead.lastError ? `Last error ${taskRead.lastError}` : '',
      ].filter(Boolean).join(' · '),
      pill: taskDesc.pill,
      pillClass: taskDesc.pillClass,
    },
    {
      title: 'Snapshots',
      meta: snapshots.length ? `Weather/calendar snapshots ${snapshotPill.toLowerCase()}` : 'No shared snapshots published yet',
      pill: snapshotPill,
      pillClass: snapshotPillClass,
    },
    {
      title: 'Shared config',
      meta: [
        configReferenceAt ? `Checked ${relativeTime(configReferenceAt)}` : 'No shared config read yet',
        configRead.lastDurationMs ? `${configRead.lastDurationMs} ms` : '',
        configRead.lastError ? `Last error ${configRead.lastError}` : '',
      ].filter(Boolean).join(' · '),
      pill: configDesc.pill,
      pillClass: configDesc.pillClass,
    },
  ];
}


function getAmbientHealthState() {
  const freshnessItems = getDataFreshnessItems();
  const freshnessMap = new Map(freshnessItems.map((item) => [item.title, item]));
  const snapshotItems = buildSnapshotStatusItems();
  const sw = appState.serviceWorkerDiagnostics || {};
  const connection = appState.connectionStatus || {};
  const publisher = appState.calendarPublisherDiagnostics || {};
  const issues = [];

  function addIssue(level, title, meta = '') {
    issues.push({ level, title, meta });
  }

  if (sw.mismatch) {
    addIssue('degraded', 'Version mismatch', sw.mismatchReason || 'Refresh this display to load the current build.');
  } else if (sw.updateReady) {
    addIssue('aging', 'Update ready', 'Refresh this display to load the latest build.');
  } else if (sw.registrationState === 'error') {
    addIssue('degraded', 'Service worker error', sw.mismatchReason || 'This display may be running stale assets.');
  }

  const realtimeState = connection.realtime || {};
  if (realtimeState.level === 'warn' || realtimeState.level === 'error') {
    addIssue('degraded', 'Realtime degraded', `Fallback refresh every ${getAutoRefreshSeconds()}s is active.`);
  } else if (realtimeState.level === 'unknown' && appState.supabase) {
    addIssue('aging', 'Realtime connecting', 'Live updates are still coming online.');
  }

  const taskFreshness = freshnessMap.get('Tasks');
  const snapshotFreshness = freshnessMap.get('Snapshots');
  const configFreshness = freshnessMap.get('Shared config');

  if (taskFreshness?.pill === 'Stale') {
    addIssue('degraded', 'Tasks stale', taskFreshness.meta || 'Task data may be out of date.');
  } else if (taskFreshness?.pill === 'Aging') {
    addIssue('aging', 'Tasks aging', taskFreshness.meta || 'Task data is getting older.');
  }

  if (snapshotFreshness?.pill === 'Stale') {
    addIssue('degraded', 'Snapshots stale', snapshotFreshness.meta || 'Weather/calendar snapshots are out of date.');
  } else if (snapshotFreshness?.pill === 'Aging') {
    addIssue('aging', 'Snapshots aging', snapshotFreshness.meta || 'Weather/calendar snapshots are getting older.');
  }

  const staleSnapshotDetails = snapshotItems.filter((item) => item.pill === 'Stale');
  if (staleSnapshotDetails.length) {
    addIssue('degraded', 'Snapshot source stale', staleSnapshotDetails.map((item) => item.title).slice(0, 2).join(' · '));
  }

  if (configFreshness?.pill === 'Stale') {
    addIssue('degraded', 'Shared config stale', configFreshness.meta || 'Shared settings may be out of date.');
  } else if (configFreshness?.pill === 'Aging') {
    addIssue('aging', 'Shared config aging', configFreshness.meta || 'Shared settings are getting older.');
  }

  if (publisher.lastPublishError) {
    addIssue('degraded', 'Publisher error', publisher.lastPublishError);
  }

  let level = 'ok';
  if (issues.some((issue) => issue.level === 'degraded')) level = 'degraded';
  else if (issues.some((issue) => issue.level === 'aging')) level = 'aging';

  const primary = issues[0] || null;
  const title = level === 'degraded'
    ? 'Live view is degraded'
    : level === 'aging'
      ? 'Live view may be slightly behind'
      : 'Live view is healthy';

  let message = 'Realtime and shared data look healthy.';
  if (primary) {
    message = primary.meta || primary.title;
  } else if (!isRealtimeHealthy()) {
    message = `Realtime fallback refresh is active every ${getAutoRefreshSeconds()}s.`;
  }

  const pills = [];
  if (level !== 'ok') pills.push(level === 'degraded' ? 'Degraded' : 'Aging');
  if (!isRealtimeHealthy()) pills.push(`Refresh ${getAutoRefreshSeconds()}s`);
  if (sw.updateReady) pills.push('Update ready');
  if (sw.mismatch) pills.push('Version mismatch');

  return {
    level,
    title,
    message,
    issues,
    pills,
  };
}


function placeInlineTrustIndicator() {
  document.querySelectorAll('.inline-trust-indicator').forEach((node) => node.remove());
  if (appState.config.mode === 'mobile' || appState.config.mode === 'tv' || !trustIndicator) return;
  const firstHeader = screenEl.querySelector('.card .card-header');
  if (!firstHeader) return;
  const inlineButton = trustIndicator.cloneNode(true);
  inlineButton.id = '';
  inlineButton.classList.add('inline-trust-indicator');
  inlineButton.onclick = () => trustIndicator.click();
  firstHeader.append(inlineButton);
}

function buildAmbientFooter() {
  const health = getAmbientHealthState();
  const footer = document.createElement('section');
  footer.className = `ambient-footer ${health.level}`;

  const left = document.createElement('div');
  left.className = 'ambient-footer-copy';

  const title = document.createElement('div');
  title.className = 'ambient-footer-title';
  title.textContent = health.level === 'ok' ? 'Trust details' : health.title;

  const detail = document.createElement('div');
  detail.className = 'ambient-footer-detail';
  const issueBits = (health.issues || []).slice(0, 3).map((issue) => issue.title);
  const statusText = (statusLine?.textContent || '').trim();
  if (health.level === 'ok') {
    detail.textContent = statusText || 'Live view is healthy.';
  } else {
    detail.textContent = [health.message, issueBits.length > 1 ? issueBits.slice(1).join(' · ') : '', statusText].filter(Boolean).join(' · ');
  }

  left.append(title, detail);
  footer.append(left);

  const right = document.createElement('div');
  right.className = 'ambient-footer-actions';

  if (health.pills?.length) {
    const pills = document.createElement('div');
    pills.className = 'ambient-footer-pills';
    for (const label of health.pills.slice(0, 3)) {
      const pill = document.createElement('span');
      pill.className = `pill ${health.level === 'degraded' ? 'warning' : ''}`.trim();
      pill.textContent = label;
      pills.append(pill);
    }
    right.append(pills);
  }

  const controls = document.createElement('div');
  controls.className = 'ambient-footer-controls';
  controls.append(
    buildSecondaryButton('Refresh', () => refreshButton?.click(), 'mini-button footer-button'),
    buildSecondaryButton('Settings', () => settingsButton?.click(), 'mini-button footer-button'),
  );
  if (versionTag) controls.append(versionTag);
  right.append(controls);

  footer.append(right);
  return footer;
}

function renderTrustIndicator() {
  if (!trustIndicator) return;
  const health = getAmbientHealthState();
  const level = health?.level || 'ok';
  const degraded = level === 'degraded' || level === 'aging';
  trustIndicator.className = `trust-indicator ${degraded ? 'degraded' : 'healthy'}`;
  trustIndicator.textContent = degraded ? '!' : '✓';
  trustIndicator.setAttribute('aria-label', degraded ? 'Trust degraded' : 'Trust healthy');
  trustIndicator.setAttribute('title', degraded ? `${health.title}: ${health.message}` : 'Live view healthy');
}

function buildSnapshotStatusItems() {
  const snapshotEntries = [
    ['Weather', getSnapshot(appState.config.weatherSnapshotType)],
    ['Calendar Today', getSnapshot(appState.config.calendarTodaySnapshotType)],
    ['Calendar Tomorrow', getSnapshot(appState.config.calendarTomorrowSnapshotType)],
  ];
  return snapshotEntries.map(([label, snapshot]) => {
    const freshness = getSnapshotFreshnessState(snapshot);
    if (!snapshot) {
      return { title: label, meta: 'Not published yet', pill: freshness.pill, pillClass: freshness.pillClass };
    }
    const publisher = describeSnapshotPublisher(snapshot);
    const metaBits = [snapshotMetaLabel(label, snapshot)];
    if (publisher && label.startsWith('Calendar')) metaBits.push(`Publisher ${publisher}`);
    return {
      title: label,
      meta: metaBits.filter(Boolean).join(' · '),
      pill: freshness.pill,
      pillClass: freshness.pillClass,
    };
  });
}

function buildSharedSyncItems() {
  const entries = [
    ['Weather config', SHARED_CONFIG_KEYS.weather],
    ['Calendar config', SHARED_CONFIG_KEYS.calendarAccounts],
    ['Signal rules', SHARED_CONFIG_KEYS.signalRules],
  ];
  return entries.map(([label, key]) => {
    const updatedAt = getSharedConfigUpdatedAt(key);
    const hasValue = appState.sharedConfig && Object.prototype.hasOwnProperty.call(appState.sharedConfig, key);
    return {
      title: label,
      meta: updatedAt ? `Updated ${relativeTime(updatedAt)}` : 'Not pushed yet',
      pill: updatedAt ? 'Shared' : (hasValue ? 'Local' : 'Missing'),
      pillClass: updatedAt ? '' : 'warning',
    };
  });
}

function formatPublisherHealthMeta(parts = []) {
  return parts.filter(Boolean).join(' · ') || 'No diagnostics yet';
}

function buildHousekeepingResultItems() {
  const diagnostics = appState.housekeepingDiagnostics || {};
  const results = Array.isArray(diagnostics.results) ? diagnostics.results : [];
  const items = [];
  if (diagnostics.lastRunAt) {
    items.push({
      title: 'Last housekeeping run',
      meta: `Completed ${relativeTime(diagnostics.lastRunAt)}`,
      pill: 'Recorded',
    });
  }
  results.forEach((result) => {
    items.push({
      title: result.label || result.table || 'Housekeeping table',
      meta: formatPublisherHealthMeta([
        result.updatedAt ? `Updated ${relativeTime(result.updatedAt)}` : '',
        Number.isFinite(result.retentionDays) ? `Keeps ${result.retentionDays} day${result.retentionDays === 1 ? '' : 's'}` : '',
        result.cutoffIso ? `Cutoff ${new Date(result.cutoffIso).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : '',
        Number.isFinite(result.prunedRows) ? `${result.prunedRows} row${result.prunedRows === 1 ? '' : 's'} pruned` : '',
        result.error ? result.error : '',
      ]),
      pill: result.ok ? (Number.isFinite(result.prunedRows) ? (result.prunedRows > 0 ? 'Pruned' : 'Checked') : 'Healthy') : 'Error',
      pillClass: result.ok ? '' : 'warning',
    });
  });
  return items;
}

function buildPublisherHealthItems() {
  const items = [];
  const publisher = appState.calendarPublisherDiagnostics || {};
  const snapshotWrite = ((appState.ioDiagnostics || {}).writes || {}).snapshotPublish || {};
  const housekeeping = ((appState.ioDiagnostics || {}).writes || {}).housekeeping || {};

  items.push({
    title: `Calendar publisher: ${publisher.lastPublishStatus || 'idle'}`,
    meta: formatPublisherHealthMeta([
      publisher.lastAttemptAt ? `Attempt ${relativeTime(publisher.lastAttemptAt)}` : 'No attempt yet',
      publisher.lastPublishAt ? `Success ${relativeTime(publisher.lastPublishAt)}` : '',
      publisher.lastAttemptReason || '',
      Number.isFinite(publisher.lastSelectedSources) ? `${publisher.lastSelectedSources} source${publisher.lastSelectedSources === 1 ? '' : 's'}` : '',
    ]),
    pill: publisher.lastPublishStatus === 'published' ? 'Healthy' : (publisher.lastPublishStatus === 'error' ? 'Error' : (publisher.lastPublishStatus === 'skipped' ? 'Idle' : 'Trace')),
    pillClass: publisher.lastPublishStatus === 'error' ? 'warning' : '',
  });

  if (publisher.lastPublishError || publisher.lastSkipReason) {
    items.push({
      title: publisher.lastPublishError ? 'Last publisher error' : 'Last publisher skip',
      meta: publisher.lastPublishError || publisher.lastSkipReason || 'No details',
      pill: publisher.lastPublishError ? 'Error' : 'Skip',
      pillClass: 'warning',
    });
  }

  items.push({
    title: 'Snapshot writer',
    meta: formatPublisherHealthMeta([
      snapshotWrite.lastStartedAt ? `Attempt ${relativeTime(snapshotWrite.lastStartedAt)}` : 'No attempt yet',
      snapshotWrite.lastFinishedAt && snapshotWrite.successes ? `Success ${relativeTime(snapshotWrite.lastFinishedAt)}` : '',
      snapshotWrite.lastReason || '',
      Number.isFinite(snapshotWrite.lastRows) ? `${snapshotWrite.lastRows} row${snapshotWrite.lastRows === 1 ? '' : 's'}` : '',
      Number.isFinite(snapshotWrite.lastDurationMs) && snapshotWrite.lastFinishedAt ? `${snapshotWrite.lastDurationMs} ms` : '',
    ]),
    pill: snapshotWrite.lastError ? 'Error' : ((snapshotWrite.successes || 0) > 0 ? 'Healthy' : ((snapshotWrite.attempts || 0) > 0 ? 'Trace' : 'Idle')),
    pillClass: snapshotWrite.lastError ? 'warning' : '',
  });

  if (snapshotWrite.lastError) {
    items.push({
      title: 'Last snapshot write error',
      meta: snapshotWrite.lastError,
      pill: 'Error',
      pillClass: 'warning',
    });
  }

  items.push({
    title: 'Housekeeping job',
    meta: formatPublisherHealthMeta([
      housekeeping.lastStartedAt ? `Attempt ${relativeTime(housekeeping.lastStartedAt)}` : 'No run yet',
      housekeeping.lastFinishedAt && housekeeping.successes ? `Success ${relativeTime(housekeeping.lastFinishedAt)}` : '',
      housekeeping.lastReason || '',
      Number.isFinite(housekeeping.lastDurationMs) && housekeeping.lastFinishedAt ? `${housekeeping.lastDurationMs} ms` : '',
    ]),
    pill: housekeeping.lastError ? 'Error' : ((housekeeping.successes || 0) > 0 ? 'Healthy' : ((housekeeping.attempts || 0) > 0 ? 'Trace' : 'Idle')),
    pillClass: housekeeping.lastError ? 'warning' : '',
  });

  if (housekeeping.lastError) {
    items.push({
      title: 'Last housekeeping error',
      meta: housekeeping.lastError,
      pill: 'Error',
      pillClass: 'warning',
    });
  }

  return items;
}

function buildServiceWorkerDebugSummary() {
  const diag = appState.serviceWorkerDiagnostics || {};
  const descriptor = evaluateServiceWorkerDiagnostics();
  return {
    title: `Client version: ${APP_VERSION} · ${descriptor.text}`,
    meta: [
      diag.controllerVersion ? `Controller ${diag.controllerVersion}` : 'No active controller',
      diag.cacheVersion ? `Cache ${diag.cacheVersion}` : '',
      diag.waitingVersion ? `Waiting ${diag.waitingVersion}` : '',
      diag.lastCheckAt ? `Checked ${relativeTime(diag.lastCheckAt)}` : '',
    ].filter(Boolean).join(' · '),
    pill: diag.mismatch ? 'Mismatch' : (diag.updateReady ? 'Update' : 'Version'),
    pillClass: diag.mismatch || diag.updateReady ? 'warning' : '',
  };
}

function buildServiceWorkerStatusItems() {
  const diag = appState.serviceWorkerDiagnostics || {};
  const descriptor = evaluateServiceWorkerDiagnostics();
  const items = [{
    title: `App ${APP_VERSION} · ${descriptor.text}`,
    meta: [
      diag.controllerVersion ? `Controller ${diag.controllerVersion}` : 'No active controller yet',
      diag.cacheVersion ? `Cache ${diag.cacheVersion}` : '',
      diag.lastCheckAt ? `Checked ${relativeTime(diag.lastCheckAt)}` : '',
    ].filter(Boolean).join(' · '),
    pill: diag.mismatch ? 'Mismatch' : (diag.updateReady ? 'Update' : 'Aligned'),
    pillClass: diag.mismatch || diag.updateReady ? 'warning' : '',
  }];
  if (diag.mismatchReason) {
    items.push({
      title: 'Refresh recommended on this device',
      meta: `${diag.mismatchReason}. A hard refresh or reopening the app should pick up the new worker.`,
      pill: 'Action',
      pillClass: 'warning',
    });
  } else if (diag.updateReady) {
    items.push({
      title: 'New service worker is waiting',
      meta: `${diag.waitingVersion ? `Version ${diag.waitingVersion}` : 'A newer worker'} is ready and should take over shortly. Reopen this display if it feels stale.`,
      pill: 'Queued',
      pillClass: 'warning',
    });
  }
  if (!diag.controllerScriptUrl) {
    items.push({
      title: 'First load may not be controlled yet',
      meta: 'Standalone displays usually attach to the new service worker after the next navigation or reopen.',
      pill: 'Info',
    });
  }
  return items;
}

function getSnapshot(type) {
  return appState.snapshots[type] || null;
}

function getSnapshotPayload(type) {
  return getSnapshot(type)?.payload || null;
}

function snapshotMetaLabel(prefix, snapshot) {
  if (!snapshot) return prefix;
  return `${prefix} · ${relativeTime(snapshot.created_at)}`;
}

function normalizeDate(value, anchorDate = null) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const base = anchorDate ? new Date(anchorDate) : getNowDate();
  if (Number.isNaN(base.getTime())) return null;
  const lower = raw.toLowerCase();
  const baseDay = startOfDay(base);

  if (lower === 'today') return baseDay;
  if (lower === 'tomorrow') {
    const d = new Date(baseDay);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower === 'next week') {
    const d = new Date(baseDay);
    d.setDate(d.getDate() + 7);
    return d;
  }

  const weekdayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  if (weekdayMap[lower] !== undefined) {
    const d = new Date(baseDay);
    const current = d.getDay();
    let delta = (weekdayMap[lower] - current + 7) % 7;
    if (delta == 0) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  const inDaysMatch = lower.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const d = new Date(baseDay);
    d.setDate(d.getDate() + Number(inDaysMatch[1]));
    return d;
  }

  const nextWeekdayMatch = lower.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextWeekdayMatch) {
    const d = new Date(baseDay);
    const target = weekdayMap[nextWeekdayMatch[1]];
    let delta = (target - d.getDay() + 7) % 7;
    delta += delta === 0 ? 7 : 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  return null;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTaskTiming(date) {
  if (isSameDay(date, getNowDate())) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return formatDate(date);
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

function isEvening() {
  const hour = getNowDate().getHours();
  return hour >= 17;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function prettifyEventType(value) {
  return value?.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Event';
}

function guessActor() {
  return appState.config.deviceName?.toLowerCase().includes('skye') ? 'Skye' : 'Wes';
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

function stripEmailLikeText(value) {
  return String(value || '').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '').replace(/\s+—\s*$/, '').trim();
}

function getCalendarSourceLabel(account, calendar) {
  const preferred = stripEmailLikeText(account?.name || account?.displayName || '');
  const calendarLabel = stripEmailLikeText(calendar?.summary || calendar?.id || 'Calendar');
  return preferred || calendarLabel || 'Calendar';
}

function normalizeEmailKey(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeCalendarAccountsForShare(accounts) {
  return (accounts || []).map(account => ({
    email: account.email || '',
    name: stripEmailLikeText(account.name || account.displayName || account.email || ''),
    calendars: (account.calendars || []).map(cal => ({
      id: cal.id,
      summary: cal.summary || cal.id,
      primary: !!cal.primary,
      backgroundColor: cal.backgroundColor || '',
      selected: !!cal.selected,
    })),
  }));
}

function mergeSharedCalendarSelections(localCalendars, sharedCalendars) {
  const localMap = new Map((localCalendars || []).map(cal => [cal.id, cal]));
  return (sharedCalendars || []).map(sharedCal => {
    const local = localMap.get(sharedCal.id) || {};
    return { ...local, ...sharedCal, selected: !!sharedCal.selected };
  });
}

function mergeSharedCalendarAccounts(sharedAccounts, localAccounts) {
  const localMap = new Map((localAccounts || []).map(account => [normalizeEmailKey(account.email), account]));
  const merged = (sharedAccounts || []).map(shared => {
    const local = localMap.get(normalizeEmailKey(shared.email));
    if (!local) return { ...shared };
    return {
      ...shared,
      ...local,
      email: local.email || shared.email,
      name: stripEmailLikeText(local.name || shared.name || local.email || shared.email),
      calendars: mergeSharedCalendarSelections(local.calendars, shared.calendars),
    };
  });
  for (const local of (localAccounts || [])) {
    if (!merged.find(account => normalizeEmailKey(account.email) === normalizeEmailKey(local.email))) merged.push(local);
  }
  return merged;
}

function getCalendarAuthRequirementState() {
  const sharedAccounts = Array.isArray(appState?.sharedConfig?.[SHARED_CONFIG_KEYS.calendarAccounts]) ? appState.sharedConfig[SHARED_CONFIG_KEYS.calendarAccounts] : [];
  const localAccounts = Array.isArray(appState?.calendarAccounts) ? appState.calendarAccounts : [];
  const requiredShared = sharedAccounts.filter(acc => (acc.calendars || []).some(cal => cal.selected));
  const fallbackRequired = requiredShared.length ? requiredShared : localAccounts.filter(acc => (acc.calendars || []).some(cal => cal.selected));
  const localMap = new Map(localAccounts.map(acc => [normalizeEmailKey(acc.email), acc]));

  const required = fallbackRequired.map(acc => {
    const local = localMap.get(normalizeEmailKey(acc.email)) || acc || {};
    const hasToken = !!(local.accessToken || local.token || local.googleAccessToken);
    const expiresAt = local.expiresAt || local.tokenExpiry || local.expiry || null;
    const expMs = expiresAt ? new Date(expiresAt).getTime() : null;
    const nowMs = (window.getEffectiveNow ? new Date(window.getEffectiveNow()).getTime() : Date.now());
    const isExpired = expMs ? expMs <= nowMs : !hasToken;
    return {
      email: acc.email,
      name: stripEmailLikeText(local.name || acc.name || acc.email || ''),
      hasToken,
      isExpired,
      connected: hasToken && !isExpired,
    };
  });

  return {
    totalRequired: required.length,
    connected: required.filter(r => r.connected).length,
    needsReconnect: required.filter(r => !r.connected).length,
    details: required,
  };
}


function resetAutoRefreshTimer() {
  if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
  const refreshSeconds = getAutoRefreshSeconds();
  updateIoTimerDiagnostics({ autoRefreshSeconds: refreshSeconds, autoRefreshMode: isRealtimeHealthy() ? 'healthy' : 'degraded' });
  autoRefreshTimer = window.setInterval(() => {
    if (!appState.supabase || document.hidden) return;
    updateIoTimerDiagnostics({ autoRefreshLastFiredAt: new Date().toISOString(), autoRefreshSeconds: refreshSeconds, autoRefreshMode: isRealtimeHealthy() ? 'healthy' : 'degraded' });
    pushDevLog('info', `Auto refresh fired (${refreshSeconds}s${isRealtimeHealthy() ? ' realtime-healthy' : ' degraded'})`);
    refreshAll('auto refresh').catch((error) => console.error('Auto refresh failed', error));
  }, refreshSeconds * 1000);
}

function resetSlowStateBackstopTimer() {
  if (slowStateBackstopTimer) window.clearInterval(slowStateBackstopTimer);
  updateIoTimerDiagnostics({ slowStateBackstopSeconds: SLOW_STATE_BACKSTOP_SECONDS });
  slowStateBackstopTimer = window.setInterval(() => {
    if (!appState.supabase || document.hidden || isRealtimeHealthy()) return;
    updateIoTimerDiagnostics({ slowStateBackstopLastFiredAt: new Date().toISOString(), slowStateBackstopSeconds: SLOW_STATE_BACKSTOP_SECONDS });
    runTargetedRefresh('Slow-state recovery', async () => {
      await fetchSnapshots();
      await fetchRecentLogs();
    });
  }, SLOW_STATE_BACKSTOP_SECONDS * 1000);
}

function resetCalendarPublishTimer() {
  if (calendarPublishTimer) window.clearInterval(calendarPublishTimer);
  updateIoTimerDiagnostics({ calendarPublishSeconds: CALENDAR_PUBLISH_INTERVAL_SECONDS });
  calendarPublishTimer = window.setInterval(() => {
    if (!appState.supabase || document.hidden) return;
    updateIoTimerDiagnostics({ calendarPublishLastFiredAt: new Date().toISOString(), calendarPublishSeconds: CALENDAR_PUBLISH_INTERVAL_SECONDS });
    fetchGoogleCalendarSnapshots().catch((error) => console.warn('Scheduled calendar publish failed', error));
  }, CALENDAR_PUBLISH_INTERVAL_SECONDS * 1000);
}

function resetHousekeepingTimer() {
  if (housekeepingTimer) window.clearInterval(housekeepingTimer);
  updateIoTimerDiagnostics({ housekeepingSeconds: HOUSEKEEPING_INTERVAL_SECONDS });
  housekeepingTimer = window.setInterval(() => {
    updateIoTimerDiagnostics({ housekeepingLastFiredAt: new Date().toISOString(), housekeepingSeconds: HOUSEKEEPING_INTERVAL_SECONDS });
    runHousekeeping(false).catch((error) => console.warn('Housekeeping failed', error));
  }, HOUSEKEEPING_INTERVAL_SECONDS * 1000);
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      updateServiceWorkerDiagnostics({ supported: true, registrationState: 'registering', lastCheckAt: new Date().toISOString() });
      syncServiceWorkerConnectionStatus();
      const registration = await navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`);
      attachServiceWorkerListeners(registration);
      if (registration && typeof registration.update === 'function') await registration.update();
      if (registration && registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      await refreshServiceWorkerDiagnostics(registration);
    } catch (error) {
      updateServiceWorkerDiagnostics({ registrationState: 'error', mismatch: true, mismatchReason: error?.message || 'Service worker registration failed', lastCheckAt: new Date().toISOString() });
      syncServiceWorkerConnectionStatus();
      console.warn('Service worker registration failed', error);
    }
  } else {
    updateServiceWorkerDiagnostics({ supported: false, registrationState: 'unsupported', lastCheckAt: new Date().toISOString() });
    syncServiceWorkerConnectionStatus();
  }
}

resetAutoRefreshTimer();
resetSlowStateBackstopTimer();
resetCalendarPublishTimer();
resetHousekeepingTimer();


let __hccInitStarted = false;
function scheduleInitApp() {
  if (__hccInitStarted) return;
  __hccInitStarted = true;
  initApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleInitApp, { once: true });
} else {
  scheduleInitApp();
}
