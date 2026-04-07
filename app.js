const APP_VERSION = 'v2.0.3';
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
  taskDateField: 'due_date',
  taskOwnerField: 'owner',
  taskTitleField: 'task',
  taskCompletedField: 'completed',
  taskCompletedValue: 'true',
  useStringCompleted: false,
  weatherSnapshotType: 'weather_today',
  calendarTodaySnapshotType: 'calendar_today',
  calendarTomorrowSnapshotType: 'calendar_tomorrow',
  uiRefreshSeconds: 60,
  googleClientId: '',
  weatherLocationQuery: '',
  weatherLocationName: '',
  weatherLatitude: '',
  weatherLongitude: '',
  weatherTimezone: '',
  signalRulesDraft: null,
};

const DEVICE_KEY_STORAGE = 'household-command-center-device-key';
const CONFIG_STORAGE = 'household-command-center-config';
const SETTINGS_JSON_AUTOLOAD_DONE = 'household-command-center-settings-json-autoload-done';
const TEST_TIME_STORAGE = 'household-command-center-test-time-override';
const CALENDAR_ACCOUNTS_STORAGE = 'household-command-center-google-calendar-accounts';
const SHARED_CONFIG_TABLE = 'household_config';
const SHARED_CONFIG_KEYS = {
  googleClientId: 'google_client_id',
  weather: 'weather_config',
  calendarAccounts: 'google_calendar_accounts',
  signalRules: 'signal_rules',
};
const TASK_FIELD_CANDIDATES = {
  taskTitleField: ['task', 'title', 'name', 'label'],
  taskOwnerField: ['owner', 'assigned_to', 'assignee', 'person'],
  taskDateField: ['due_date', 'due', 'due_at', 'scheduled_for', 'date'],
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

const DEFAULT_CONNECTION_STATUS = {
  supabase: { level: 'unknown', text: 'Not tested' },
  tasks: { level: 'unknown', text: 'Not tested' },
  deviceProfile: { level: 'unknown', text: 'Not tested' },
  realtime: { level: 'unknown', text: 'Not tested' },
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
  signalRulesDraft: normalizeSignalRules(INITIAL_CONFIG.signalRulesDraft),
  calendarDiagnostics: { selectedSources: 0, fetchedEvents: 0, mergedToday: 0, mergedTomorrow: 0, expiredAccounts: 0, lastError: '', lastSuccessAt: '' },
};

const screenEl = document.getElementById('screen');
const statusLine = document.getElementById('status-line');
const settingsButton = document.getElementById('settings-button');
const refreshButton = document.getElementById('refresh-button');
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
  saveConfig(appState.config);
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
  const escalateHour = clampHour(input.escalateHour, Math.max(startHour, 20));
  return {
    id: String(input.id || createRuleId()),
    enabled: input.enabled !== undefined ? !!input.enabled : true,
    name: String(input.name || '').trim(),
    scheduleType: scheduleType === 'daily' ? 'daily' : 'weekly',
    dayOfWeek: Number.isFinite(Number(input.dayOfWeek)) ? Math.max(0, Math.min(6, Number(input.dayOfWeek))) : 3,
    startHour,
    clearMode: clearMode === 'log_event_today' ? 'log_event_today' : 'schedule_window',
    ackEventType: String(input.ackEventType || '').trim(),
    escalateToWarning,
    escalateHour: Math.max(startHour, escalateHour),
    location: String(input.location || '').trim(),
  };
}

function summarizeCustomSignalRule(rule) {
  const normalized = normalizeCustomSignalRule(rule);
  const scheduleLabel = normalized.scheduleType === 'daily'
    ? `Daily from ${formatHourLabel(normalized.startHour)}`
    : `${DAY_OPTIONS.find(([value]) => Number(value) === normalized.dayOfWeek)?.[1] || 'Weekly'} from ${formatHourLabel(normalized.startHour)}`;
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
  resetAutoRefreshTimer();
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
  await withTimeout(loadDeviceProfile(), BOOT_TIMEOUT_MS, 'Device profile timed out');
  window.__hccBootState.phase = 'loading-household-data';
  setStatus('Loading household data…');
  await withTimeout(refreshAll(), BOOT_TIMEOUT_MS, 'Initial data load timed out');
  bindRealtime();
  window.__hccBootState.phase = 'ready';
  window.__hccBootState.finished = true;
}


function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(label)), ms)),
  ]);
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
    saveConfig(appState.config);
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
  try {
    const { data, error } = await appState.supabase
      .from('device_profiles')
      .select('*')
      .eq('device_key', appState.deviceKey)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      appState.deviceProfile = data;
      appState.config.deviceName = data.device_name || appState.config.deviceName;
      appState.config.mode = data.mode || appState.config.mode;
      appState.config.location = data.location || appState.config.location;
      saveConfig(appState.config);
      fillSettingsForm();
      setStatus(`Connected as ${appState.config.deviceName} (${appState.config.mode})`);
      return;
    }

    const insertPayload = {
      device_name: appState.config.deviceName,
      device_key: appState.deviceKey,
      mode: appState.config.mode,
      location: appState.config.location,
      settings: {},
      is_active: true,
    };

    const { data: inserted, error: insertError } = await appState.supabase
      .from('device_profiles')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) throw insertError;
    appState.deviceProfile = inserted;
    setStatus(`Created device profile for ${appState.config.deviceName}`);
  } catch (error) {
    console.error(error);
    setStatus(`Device profile warning: ${error.message}`);
  }
}

async function refreshAll() {
  if (!appState.supabase) {
    setStatus('Supabase settings needed.');
    return;
  }
  setStatus(`Refreshing ${appState.config.mode} view…`);
  try {
    await Promise.all([
      fetchTasks(),
      fetchSignals(),
      fetchLoads(),
      fetchSnapshots(),
      fetchRecentLogs(),
    ]);

    // Render immediately from shared/base data so headless displays never block on optional enrichments.
    renderMode();
    renderDevConsole();

    const followup = await Promise.allSettled([
      fetchGoogleCalendarSnapshots(),
      fetchWeatherSnapshot(),
    ]);

    for (const result of followup) {
      if (result.status === 'rejected') {
        console.warn('Follow-up refresh issue', result.reason);
      }
    }

    renderMode();
    renderDevConsole();
    setStatus(`Showing ${appState.config.mode} mode · Updated ${getNowDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  } catch (error) {
    handleRuntimeActionError('Refresh failed', error);
    renderDevConsole();
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
    saveConfig(appState.config);
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

function taskQueryCandidateFilters(baseQuery, completedField) {
  return [
    () => baseQuery.eq(completedField, false),
    () => baseQuery.eq(completedField, 'false'),
    () => baseQuery.eq(completedField, 0),
    () => baseQuery.or(`${completedField}.is.null,${completedField}.eq.false`),
  ];
}

async function fetchTasks() {
  const { taskTable } = appState.config;
  const completedField = appState.config.taskCompletedField;
  const buildBaseQuery = () => appState.supabase.from(taskTable).select('*').limit(120);

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
    console.warn('Task fetch issue', error);
    appState.tasks = [];
    return;
  }

  const rows = data || [];
  maybeAutoMapTaskFields(rows);
  appState.tasks = rows.filter((task) => !taskIsCompleted(task) && !taskIsArchived(task));
  pushDevLog('info', `Fetched ${appState.tasks.length} visible tasks from ${taskTable}`);
}

async function fetchSignals() {
  const { data, error } = await appState.supabase
    .from('household_signals')
    .select('*')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) {
    console.warn('Signal fetch issue', error);
    appState.signals = [];
    return;
  }
  appState.signals = data || [];
}

async function fetchLoads() {
  const { data, error } = await appState.supabase
    .from('laundry_loads')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('Laundry fetch issue', error);
    appState.loads = [];
    return;
  }
  appState.loads = data || [];
}

async function fetchSnapshots() {
  const types = [
    appState.config.weatherSnapshotType,
    appState.config.calendarTodaySnapshotType,
    appState.config.calendarTomorrowSnapshotType,
  ];
  const { data, error } = await appState.supabase
    .from('context_snapshots')
    .select('*')
    .in('context_type', types)
    .order('created_at', { ascending: false });
  if (error) {
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
}


async function refreshWeatherOnly() {
  try {
    pushDevLog('info', 'Starting weather refresh.');
    await fetchWeatherSnapshot();
    renderMode();
    renderDevConsole();
    showToast('Weather refreshed', 'success');
  } catch (error) {
    handleRuntimeActionError('Weather refresh failed', error);
    renderDevConsole();
    showToast('Weather refresh failed', 'error');
  }
}

async function refreshFromSnapshotUpdate() {
  try {
    await fetchSnapshots();
    renderMode();
    renderDevConsole();
    pushDevLog('info', 'Applied snapshot update without full refresh.');
  } catch (error) {
    console.warn('Snapshot-only refresh issue', error);
    pushDevLog('warn', `Snapshot-only refresh failed: ${error?.message || error}`);
  }
}

async function fetchRecentLogs() {
  const { data, error } = await appState.supabase
    .from('household_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    console.warn('Log fetch issue', error);
    appState.logs = [];
    return;
  }
  appState.logs = data || [];
}

function bindRealtime() {
  clearSubscriptions();
  if (!appState.supabase) return;
  const channels = [
    { table: appState.config.taskTable, event: '*', handler: refreshAll },
    { table: 'household_logs', event: '*', handler: refreshAll },
    { table: 'household_signals', event: '*', handler: refreshAll },
    { table: 'laundry_loads', event: '*', handler: refreshAll },
    { table: 'context_snapshots', event: '*', handler: refreshFromSnapshotUpdate },
    { table: SHARED_CONFIG_TABLE, event: '*', handler: async () => {
        await fetchHouseholdConfig();
        await fetchSnapshots();
        renderMode();
        renderDevConsole();
        pushDevLog('info', 'Applied shared config update without full refresh.');
      } },
  ];

  appState.subscriptions = channels.map(({ table, event, handler }) => {
    const channel = appState.supabase
      .channel(`realtime-${table}`)
      .on('postgres_changes', { event, schema: 'public', table }, handler)
      .subscribe();
    return channel;
  });
}

function clearSubscriptions() {
  if (!appState.subscriptions?.length || !appState.supabase) return;
  for (const channel of appState.subscriptions) appState.supabase.removeChannel(channel);
  appState.subscriptions = [];
}


const MODE_LAYOUTS = {
  kitchen: {
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
    screenClass: 'screen single-column widget-layout widget-layout-tv',
    widgets: ['tvHero', 'tvToday', 'tvSignals', 'tvFocus'],
  },
  laundry: {
    screenClass: 'screen single-column widget-layout widget-layout-laundry',
    widgets: ['laundrySummary', 'laundryLoads', 'laundrySignals'],
  },
  bedroom: {
    screenClass: 'screen single-column bedroom-layout widget-layout widget-layout-bedroom',
    widgets: ['context', 'bedroomPrimary', 'bedroomLaundry', 'bedroomForget'],
  },
  mobile: {
    screenClass: 'screen two-columns widget-layout widget-layout-mobile',
    widgets: ['today', 'laundryLoads', 'upcoming', 'recentLogs', 'signals', 'quickActions', 'context', 'taskMapping'],
  },
};

function renderMode() {
  const mode = appState.config.mode || 'tv';
  document.body.classList.toggle('tv-mode', mode === 'tv');
  document.body.classList.toggle('mobile-mode', mode === 'mobile');
  const digest = buildTaskDigest();
  const widgetContext = buildWidgetContext(digest);
  if (mode === 'mobile') {
    renderMobileControlPanel(widgetContext);
    return;
  }
  renderModeLayout(mode, widgetContext);
}

function buildWidgetContext(digest) {
  return {
    mode: appState.config.mode,
    digest,
    signals: activeSignals(),
    tomorrowItems: buildTomorrowItems(),
    forgetItems: buildForgetItems(),
    focusItem: buildSoftFocus(),
    isEvening: isEvening(),
    presentationPhase: getPresentationPhase(),
  };
}

function renderModeLayout(mode, context) {
  const layout = MODE_LAYOUTS[mode] || MODE_LAYOUTS.kitchen;
  screenEl.className = layout.screenClass;
  screenEl.replaceChildren();

  if (mode === 'tv') {
    const tvWrap = document.createElement('div');
    tvWrap.className = 'tv-layout';
    for (const widgetId of layout.widgets) {
      const node = renderWidget(widgetId, context);
      if (node) tvWrap.append(node);
    }
    screenEl.append(tvWrap);
    return;
  }

  for (const widgetId of layout.widgets) {
    const node = renderWidget(widgetId, context);
    if (node) screenEl.append(node);
  }
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
  today: (context) => buildCard('Today', '', renderTaskList(context.digest.todayTasks, 'No tasks visible.', { showPills: true })),
  spotlight: (context) => buildCard('Best Next Move', 'Most useful thing to do next', renderSpotlightCard(context.digest.spotlightTask)),
  signals: (context) => buildCard('Needs Attention', `${context.signals.length} visible`, renderList(context.signals.slice(0, 6).map(signalToItem), 'Everything looks calm right now.')),
  upcoming: (context) => buildCard('Coming Up', `${context.digest.upcomingTasks.length} coming soon`, renderTaskList(context.digest.upcomingTasks.slice(0, 6), 'Nothing is queued up soon.', { showPills: true })),
  quickActions: () => buildQuickActionsCard(),
  forget: (context) => buildCard('Don’t Forget', 'Short and important', renderTaskList(context.digest.overdueTasks.slice(0, 4).concat(context.forgetItems.slice(0, 2)), 'Nothing critical is waiting.', { showPills: true })),
  context: () => buildCard('Weather & Next Event', 'Context for the day', renderContextStack()),
  taskMapping: () => buildCard('Task Mapping', 'Live field mapping for this board', renderTaskMappingSummary()),
  tvHero: () => buildTvHero(),
  tvToday: (context) => buildCard(context.isEvening ? 'Today + Tomorrow' : 'Today', context.isEvening ? 'Evening preview is starting to fold in tomorrow' : '', renderTaskList(buildTvTodayItems(context), 'Nothing major on the board.', { compact: true, showPills: true }), 'tv-card tv-tall-card'),
  tvSignals: (context) => buildCard('Attention', '', renderList(context.signals.slice(0, 4).map(signalToItem), 'House is in a good place.'), 'tv-card tv-tall-card'),
  tvFocus: (context) => buildCard(context.isEvening ? 'Tomorrow' : 'Focus', '', context.isEvening ? renderTaskList(context.tomorrowItems.slice(0, 3), 'Tomorrow is still open.', { compact: true, showPills: true }) : renderFocusBlock(context.focusItem), 'tv-card tv-bottom-card'),
  laundrySummary: () => buildCard('Laundry Status', 'Tap a load to move it forward', renderLaundrySummary(), 'laundry-summary-card'),
  laundryLoads: () => buildCard('Loads In Progress', 'Washer, dryer, and ready-to-fold loads', renderLaundryLoads(), 'laundry-loads-card'),
  laundrySignals: () => buildCard('Laundry Signals', 'Useful reminders for the workflow', renderLaundrySignals(), 'laundry-signals-card'),
  bedroomPrimary: (context) => buildCard(context.isEvening ? 'Tomorrow' : 'Today', describeDateContext(context), renderTaskList(buildBedroomPrimaryItems(context), `Nothing big for ${(context.isEvening ? 'tomorrow' : 'today')} yet.`, { showPills: true })),
  bedroomLaundry: () => buildCard('Laundry', 'Quickly move loads forward', renderBedroomLaundry(), 'bedroom-laundry-card'),
  bedroomForget: (context) => buildCard('Don’t Forget', 'Gentle reminders', renderTaskList(context.forgetItems, 'No key reminders right now.', { showPills: true })),
  recentLogs: () => buildCard('Recent Logs', '', renderList(appState.logs.map(logToItem), 'No quick logs yet.')),
};


function renderMobileControlPanel(context) {
  screenEl.className = 'screen single-column mobile-control-screen';
  screenEl.replaceChildren();

  const tabs = [
    ['status', 'Status'],
    ['logs', 'Logs'],
    ['calendar', 'Calendar'],
    ['weather', 'Weather'],
    ['signals', 'Signals'],
    ['debug', 'Debug'],
  ];

  const nav = document.createElement('div');
  nav.className = 'mobile-tabs';
  for (const [key, label] of tabs) {
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

  const title = document.createElement('div');
  title.className = 'card-header';
  const h2 = document.createElement('h2');
  h2.textContent = tabs.find(([k]) => k === appState.mobileTab)?.[1] || 'Status';
  const sub = document.createElement('span');
  sub.className = 'card-subtitle';
  sub.textContent = mobileTabSubtitle(appState.mobileTab, context);
  title.append(h2, sub);
  panel.append(title);

  let content;
  try {
    content = renderMobileTabContent(appState.mobileTab, context);
  } catch (error) {
    handleRuntimeActionError(`Could not render ${appState.mobileTab} tab`, error);
    content = renderInlineErrorCard(`The ${appState.mobileTab} tab hit an error.`, error);
  }
  body.append(content);
  panel.append(body);
  screenEl.append(panel);
}

function mobileTabSubtitle(tab, context) {
  if (tab === 'status') return 'Whole-house summary';
  if (tab === 'logs') return 'Recent actions and links';
  if (tab === 'calendar') return `${appState.calendarAccounts.length} connected account${appState.calendarAccounts.length === 1 ? '' : 's'}`;
  if (tab === 'weather') return appState.config.weatherLocationName || appState.config.weatherLocationQuery || 'Weather configuration';
  if (tab === 'signals') return 'Household reminder rules and previews';
  if (tab === 'debug') return appState.testTimeOverride ? `Test time active · ${new Date(appState.testTimeOverride).toLocaleString()}` : 'Diagnostics and test controls';
  return '';
}

function renderMobileTabContent(tab, context) {
  if (tab === 'status') return renderMobileStatus(context);
  if (tab === 'logs') return renderMobileLogs();
  if (tab === 'calendar') return renderMobileCalendar();
  if (tab === 'weather') return renderMobileWeather();
  if (tab === 'signals') return renderMobileSignals();
  if (tab === 'debug') return renderMobileDebug();
  return document.createTextNode('');
}

function renderMobileStatus(context) {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-stack';
  wrap.append(buildCard('Active Signals', `${context.signals.length} visible`, renderList(context.signals.slice(0, 6).map(signalToItem), 'Everything looks calm right now.')));
  wrap.append(buildCard('Laundry Snapshot', 'Current workflow', renderLaundrySummary(), 'mobile-compact-card'));
  const events = buildBedroomPrimaryItems({ ...context, isEvening: false }).filter((item) => item.pill === 'Calendar').slice(0, 3);
  wrap.append(buildCard('Next Events', 'Merged calendar feed', renderTaskList(events, 'No upcoming events right now.', { showPills: true }), 'mobile-compact-card'));
  wrap.append(buildCard('Weather', 'Current household weather', renderContextStack(), 'mobile-compact-card'));
  wrap.append(buildCard('System Health', 'Quick service check', renderConnectionStatusPanel(), 'mobile-compact-card'));
  return wrap;
}

function renderMobileLogs() {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-stack';
  const actions = document.createElement('div');
  actions.className = 'mobile-inline-actions';
  const openSupabase = document.createElement('a');
  openSupabase.className = 'secondary-button mobile-link-button';
  openSupabase.href = 'https://supabase.com/dashboard/project/pssgbrtyhwoumhiynwlj';
  openSupabase.target = '_blank';
  openSupabase.rel = 'noreferrer';
  openSupabase.textContent = 'Open Supabase project';
  actions.append(openSupabase);
  wrap.append(actions);
  wrap.append(renderList(appState.logs.slice(0, 30).map(logToItem), 'No recent logs yet.'));
  return wrap;
}

function renderMobileCalendar() {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-stack';
  const actions = document.createElement('div');
  actions.className = 'mobile-inline-actions';
  const addBtn = document.createElement('button');
  addBtn.className = 'secondary-button';
  addBtn.textContent = 'Add Google account';
  addBtn.addEventListener('click', () => connectGoogleAccountButton?.click());
  const pushBtn = document.createElement('button');
  pushBtn.className = 'secondary-button';
  pushBtn.textContent = 'Push calendar config';
  pushBtn.addEventListener('click', async () => {
    try {
      await pushSharedCalendarConfig();
    } catch (error) {
      handleRuntimeActionError('Calendar push failed', error);
      showToast('Could not push calendar config', 'error');
    }
  });
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'secondary-button';
  settingsBtn.textContent = 'Open Settings';
  settingsBtn.addEventListener('click', () => settingsButton?.click());
  actions.append(addBtn, pushBtn, settingsBtn);
  wrap.append(actions);
  const headlessNote = document.createElement('div');
  headlessNote.className = 'muted';
  headlessNote.textContent = 'Headless mode: a connected device publishes merged calendar snapshots for shared displays.';
  wrap.append(headlessNote);
  const accounts = document.createElement('div');
  accounts.className = 'mobile-accounts-copy';
  accounts.append(renderCalendarAccountsClone());
  wrap.append(accounts);
  return wrap;
}

function renderCalendarAccountsClone() {
  const host = document.createElement('div');
  host.className = 'google-calendar-accounts';
  if (!appState.calendarAccounts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No Google accounts connected yet.';
    host.append(empty);
    return host;
  }
  for (const account of appState.calendarAccounts) {
    const card = document.createElement('div');
    card.className = 'calendar-account-card';
    const header = document.createElement('div');
    header.className = 'calendar-account-header';
    const title = document.createElement('div');
    title.className = 'calendar-account-title';
    title.textContent = account.displayName || account.email || 'Google account';
    const subtitle = document.createElement('div');
    subtitle.className = 'muted';
    subtitle.textContent = `${(account.calendars || []).filter(c => c.selected).length} selected calendar${(account.calendars || []).filter(c => c.selected).length === 1 ? '' : 's'}`;
    header.append(title, subtitle);
    card.append(header);
    const list = document.createElement('div');
    list.className = 'calendar-list';
    for (const calendar of account.calendars || []) {
      const row = document.createElement('div');
      row.className = 'calendar-list-item';
      row.innerHTML = `<span>${escapeHtml(calendar.summary || calendar.id)}</span><span class="pill">${calendar.selected ? 'Included' : 'Hidden'}</span>`;
      list.append(row);
    }
    card.append(list);
    host.append(card);
  }
  return host;
}

function renderMobileWeather() {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-stack';
  const actions = document.createElement('div');
  actions.className = 'mobile-inline-actions';
  const refresh = document.createElement('button');
  refresh.className = 'secondary-button';
  refresh.textContent = 'Refresh weather';
  refresh.addEventListener('click', () => refreshWeatherOnly());
  const push = document.createElement('button');
  push.className = 'secondary-button';
  push.textContent = 'Push weather config';
  push.addEventListener('click', async () => {
    try {
      await pushSharedWeatherConfig();
      await fetchHouseholdConfig();
      await refreshWeatherOnly();
    } catch (error) {
      handleRuntimeActionError('Weather push failed', error);
      showToast('Could not push weather config', 'error');
    }
  });
  const openSettings = document.createElement('button');
  openSettings.className = 'secondary-button';
  openSettings.textContent = 'Edit weather settings';
  openSettings.addEventListener('click', () => settingsButton?.click());
  actions.append(refresh, push, openSettings);
  wrap.append(actions);
  const weather = getSnapshot(appState.config.weatherSnapshotType);
  wrap.append(buildCard('Current Weather', cleanLocationName(appState.config.weatherLocationName || appState.config.weatherLocationQuery || 'No location configured'), renderTaskList(weather?.payload ? [{ title: formatWeatherSummary(weather.payload, { includeTomorrow: true }), meta: snapshotMetaLabel('Weather', weather), pill: snapshotFreshnessPill(weather), pillClass: snapshotFreshnessClass(weather) }] : [], 'Weather not connected yet.', { showPills: true }), 'mobile-compact-card'));
  return wrap;
}


function renderSignalRuleEditorCard(title, subtitle, buildBody) {
  const card = document.createElement('section');
  card.className = 'card mobile-compact-card';
  const header = document.createElement('div');
  header.className = 'card-header';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const sub = document.createElement('span');
  sub.className = 'card-subtitle';
  sub.textContent = subtitle;
  header.append(h2, sub);
  const body = document.createElement('div');
  body.className = 'mobile-stack signal-config-card-body';
  buildBody(body);
  card.append(header, body);
  return card;
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
  const wrap = document.createElement('div');
  wrap.className = 'mobile-stack';
  const actions = document.createElement('div');
  actions.className = 'mobile-inline-actions';

  const pushBtn = document.createElement('button');
  pushBtn.className = 'secondary-button';
  pushBtn.textContent = 'Push signal config';
  pushBtn.addEventListener('click', async () => {
    try {
      await pushSharedSignalConfig();
      await fetchHouseholdConfig();
      renderMode();
    } catch (error) {
      handleRuntimeActionError('Signal config push failed', error);
      showToast('Could not push signal config', 'error');
    }
  });

  const loadSharedBtn = document.createElement('button');
  loadSharedBtn.className = 'secondary-button';
  loadSharedBtn.textContent = 'Use household config';
  loadSharedBtn.addEventListener('click', () => {
    setSignalRulesDraft(appState.sharedConfig[SHARED_CONFIG_KEYS.signalRules] || DEFAULT_SIGNAL_RULES);
    showToast('Loaded household signal config', 'success');
    renderMode();
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'secondary-button';
  resetBtn.textContent = 'Reset defaults';
  resetBtn.addEventListener('click', () => {
    setSignalRulesDraft(DEFAULT_SIGNAL_RULES);
    showToast('Reset local signal draft', 'success');
    renderMode();
  });

  actions.append(pushBtn, loadSharedBtn, resetBtn);
  wrap.append(actions);

  const note = document.createElement('div');
  note.className = 'muted';
  note.textContent = 'These controls drive synthetic household signals like bins reminders, laundry attention, tomorrow-event prompts, and your own custom reminder rules.';
  wrap.append(note);

  const rules = normalizeSignalRules(appState.signalRulesDraft || appState.sharedConfig[SHARED_CONFIG_KEYS.signalRules] || DEFAULT_SIGNAL_RULES);

  const binsCard = renderSignalRuleEditorCard('Bins reminder', 'Configurable weekly rule for shared displays', (body) => {
    body.append(makeCheckboxRow('Enable bins reminder', rules.bins.enabled, (checked) => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.bins.enabled = checked;
      setSignalRulesDraft(next);
      renderMode();
    }));
    body.append(makeSelectField('Reminder day', DAY_OPTIONS, String(rules.bins.dayOfWeek), (value) => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.bins.dayOfWeek = Number(value);
      setSignalRulesDraft(next);
      renderMode();
    }));
    body.append(makeHourField('Start showing', rules.bins.startHour, (value) => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.bins.startHour = Number(value);
      if (next.bins.escalateHour < next.bins.startHour) next.bins.escalateHour = next.bins.startHour;
      setSignalRulesDraft(next);
      renderMode();
    }));
    body.append(makeHourField('Escalate to warning', rules.bins.escalateHour, (value) => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.bins.escalateHour = Number(value);
      setSignalRulesDraft(next);
      renderMode();
    }));
  });
  wrap.append(binsCard);

  const tomorrowCard = renderSignalRuleEditorCard('Tomorrow event signal', 'Boost tomorrow awareness in the evening', (body) => {
    body.append(makeCheckboxRow('Enable big event tomorrow signal', rules.tomorrowEvent.enabled, (checked) => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.tomorrowEvent.enabled = checked;
      setSignalRulesDraft(next);
      renderMode();
    }));
    body.append(makeHourField('Start showing after', rules.tomorrowEvent.startHour, (value) => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.tomorrowEvent.startHour = Number(value);
      setSignalRulesDraft(next);
      renderMode();
    }));
  });
  wrap.append(tomorrowCard);

  const laundryCard = renderSignalRuleEditorCard('Laundry attention', 'Surface laundry activity as a household signal', (body) => {
    body.append(makeCheckboxRow('Enable laundry attention signal', rules.laundry.enabled, (checked) => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.laundry.enabled = checked;
      setSignalRulesDraft(next);
      renderMode();
    }));
  });
  wrap.append(laundryCard);

  const customCard = renderSignalRuleEditorCard('Custom signal rules', `${rules.custom.length} configured`, (body) => {
    const addBtn = document.createElement('button');
    addBtn.className = 'secondary-button';
    addBtn.type = 'button';
    addBtn.textContent = 'Add signal rule';
    addBtn.addEventListener('click', () => {
      const next = normalizeSignalRules(appState.signalRulesDraft);
      next.custom.push(normalizeCustomSignalRule({
        name: 'New signal',
        scheduleType: 'weekly',
        dayOfWeek: getNowDate().getDay(),
        startHour: Math.min(23, getNowDate().getHours()),
        clearMode: 'schedule_window',
        escalateToWarning: false,
      }));
      setSignalRulesDraft(next);
      renderMode();
    });
    body.append(addBtn);

    if (!rules.custom.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'Add a named signal with a schedule, an acknowledge rule, and optional warning escalation.';
      body.append(empty);
      return;
    }

    rules.custom.forEach((rule, index) => {
      const ruleCard = document.createElement('section');
      ruleCard.className = 'custom-signal-rule';

      const ruleHeader = document.createElement('div');
      ruleHeader.className = 'custom-signal-rule-header';
      const heading = document.createElement('strong');
      heading.textContent = rule.name || `Custom signal ${index + 1}`;
      const summary = document.createElement('span');
      summary.className = 'muted';
      summary.textContent = summarizeCustomSignalRule(rule);
      ruleHeader.append(heading, summary);
      ruleCard.append(ruleHeader);

      const updateRule = (patch) => {
        const next = normalizeSignalRules(appState.signalRulesDraft);
        next.custom = next.custom.map((item) => item.id === rule.id ? normalizeCustomSignalRule({ ...item, ...patch }) : item);
        setSignalRulesDraft(next);
        renderMode();
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'secondary-button';
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        const next = normalizeSignalRules(appState.signalRulesDraft);
        next.custom = next.custom.filter((item) => item.id !== rule.id);
        setSignalRulesDraft(next);
        renderMode();
      });
      ruleCard.append(removeBtn);

      ruleCard.append(makeCheckboxRow('Enabled', rule.enabled, (checked) => updateRule({ enabled: checked })));
      ruleCard.append(makeTextField('Signal name', rule.name, (value) => updateRule({ name: value }), 'Bins out tonight'));
      ruleCard.append(makeSelectField('Schedule rule', CUSTOM_SIGNAL_SCHEDULE_OPTIONS, rule.scheduleType, (value) => updateRule({ scheduleType: value })));
      if (rule.scheduleType === 'weekly') {
        ruleCard.append(makeSelectField('Day', DAY_OPTIONS, String(rule.dayOfWeek), (value) => updateRule({ dayOfWeek: Number(value) })));
      }
      ruleCard.append(makeHourField('Start showing', rule.startHour, (value) => updateRule({ startHour: Number(value), escalateHour: Math.max(Number(value), rule.escalateHour) })));
      ruleCard.append(makeSelectField('Clear / acknowledge', CUSTOM_SIGNAL_CLEAR_OPTIONS, rule.clearMode, (value) => updateRule({ clearMode: value })));
      if (rule.clearMode === 'log_event_today') {
        ruleCard.append(makeTextField('Household log event key', rule.ackEventType, (value) => updateRule({ ackEventType: value }), 'bins_out'));
      }
      ruleCard.append(makeCheckboxRow('Escalate to warning later', rule.escalateToWarning, (checked) => updateRule({ escalateToWarning: checked })));
      if (rule.escalateToWarning) {
        ruleCard.append(makeHourField('Escalate to warning at', rule.escalateHour, (value) => updateRule({ escalateHour: Number(value) })));
      }
      ruleCard.append(makeTextField('Location label (optional)', rule.location || '', (value) => updateRule({ location: value }), 'outside'));
      body.append(ruleCard);
    });
  });
  wrap.append(customCard);

  wrap.append(buildCard('Signal preview', 'Uses the current local draft and current time override', renderSignalRulesPreview(rules), 'mobile-compact-card'));
  return wrap;
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

function makeTextField(label, value, onChange, placeholder = '') {
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

function renderMobileDebug() {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-stack';
  const actions = document.createElement('div');
  actions.className = 'mobile-inline-actions';
  const openConsole = document.createElement('button');
  openConsole.className = 'secondary-button';
  openConsole.textContent = 'Open dev console';
  openConsole.addEventListener('click', () => { devConsoleEl.classList.remove('hidden'); renderDevConsole(); });
  const forceRefresh = document.createElement('button');
  forceRefresh.className = 'secondary-button';
  forceRefresh.textContent = 'Force refresh';
  forceRefresh.addEventListener('click', () => refreshAll());
  actions.append(openConsole, forceRefresh);
  wrap.append(actions);
  wrap.append(buildCard('Diagnostics', 'Current runtime state', renderTaskList([
    { title: `Mode: ${appState.config.mode}`, meta: `Device ${appState.config.deviceName || 'Unnamed'}`, pill: 'Config' },
    { title: `Test time: ${appState.testTimeOverride ? new Date(appState.testTimeOverride).toLocaleString() : 'Real time'}`, meta: `Status ${statusLine.textContent || ''}`, pill: 'Time' },
    { title: `Snapshots: ${Object.keys(appState.snapshots || {}).length}`, meta: `Tasks ${appState.tasks.length} · Signals ${activeSignals().length} · Loads ${appState.loads.length}`, pill: 'State' },
    { title: `Calendar fetch: ${appState.calendarDiagnostics.fetchedEvents} fetched · ${appState.calendarDiagnostics.mergedToday + appState.calendarDiagnostics.mergedTomorrow} merged`, meta: `Selected ${appState.calendarDiagnostics.selectedSources} · Expired ${appState.calendarDiagnostics.expiredAccounts}${appState.calendarDiagnostics.lastError ? ` · ${appState.calendarDiagnostics.lastError}` : ''}`, pill: 'Calendar' },
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

  const timeEl = document.createElement('div');
  timeEl.className = 'tv-clock';
  timeEl.textContent = getNowDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  topRow.append(date, timeEl);

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
  freshnessEl.textContent = [
    weather ? snapshotMetaLabel('Weather', weather) : null,
    todayCal ? snapshotMetaLabel('Calendar', todayCal) : null,
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

  const taskItems = context.digest.todayTasks.slice(0, 3);
  const overdueItems = context.digest.overdueTasks.slice(0, 1);
  const baseItems = blendTaskAndEventItems(taskItems, eventItems, overdueItems, 6);

  if (!context.isEvening) return baseItems;

  const tomorrowPreview = context.tomorrowItems.slice(0, 2).map((item) => ({
    ...item,
    pill: item.pill || 'Tomorrow',
    meta: item.meta ? `${item.meta}` : 'Tomorrow',
  }));

  return [...baseItems.slice(0, 4), ...tomorrowPreview].slice(0, 6);
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
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No active loads to move right now.';
    wrapper.append(empty);
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
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = emptyText;
    wrapper.append(empty);
    return wrapper;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'list-item';

    const left = document.createElement('div');
    left.className = 'list-item-left';
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = item.title;
    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    meta.textContent = item.meta || '';
    left.append(title, meta);

    row.append(left);
    if (options.showPills && item.pill) {
      const pill = document.createElement('span');
      pill.className = `pill ${item.pillClass || ''}`.trim();
      pill.textContent = item.pill;
      row.append(pill);
    }
    wrapper.append(row);
  }
  return wrapper;
}

function renderSpotlightCard(item) {
  const wrap = document.createElement('div');
  if (!item) {
    wrap.className = 'empty-state';
    wrap.textContent = 'No standout task yet. Once the board has today or overdue work, it will appear here.';
    return wrap;
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
    wrap.className = 'empty-state';
    wrap.textContent = 'Nothing is pressing right now.';
    return wrap;
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
  try {
    const { data, error } = await appState.supabase
      .from(SHARED_CONFIG_TABLE)
      .select('key, value, updated_at');
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    applySharedConfigRows(rows);
    pushDevLog('info', `Loaded ${rows.length} household config entr${rows.length === 1 ? 'y' : 'ies'}.`);
  } catch (error) {
    pushDevLog('warn', `Household config unavailable: ${error?.message || error}`);
  }
}


async function publishContextSnapshot(contextType, payload, source = 'headless-google-calendar', validMinutes = 15) {
  if (!appState.supabase) throw new Error('Supabase not connected');
  const row = {
    context_type: contextType,
    payload,
    source,
    valid_until: new Date(getNowMs() + validMinutes * 60 * 1000).toISOString(),
  };
  const { error } = await appState.supabase.from('context_snapshots').insert(row);
  if (error) throw error;
}

function hasAnyCalendarSnapshots() {
  return !!(
    appState.snapshots?.[appState.config.calendarTodaySnapshotType] ||
    appState.snapshots?.[appState.config.calendarTomorrowSnapshotType]
  );
}

function applySharedConfigRows(rows) {
  const map = {};
  for (const row of rows || []) map[row.key] = row.value;
  appState.sharedConfig = map;
  if (typeof map[SHARED_CONFIG_KEYS.googleClientId] === 'string' && map[SHARED_CONFIG_KEYS.googleClientId].trim()) {
    appState.config.googleClientId = map[SHARED_CONFIG_KEYS.googleClientId].trim();
  }
  const weather = map[SHARED_CONFIG_KEYS.weather];
  if (weather && typeof weather === 'object') {
    appState.config.weatherLocationQuery = String(weather.weatherLocationQuery || weather.locationQuery || appState.config.weatherLocationQuery || '').trim();
    appState.config.weatherLocationName = cleanLocationName(String(weather.weatherLocationName || weather.locationName || appState.config.weatherLocationName || '').trim());
    appState.config.weatherLatitude = String(weather.weatherLatitude || weather.latitude || appState.config.weatherLatitude || '').trim();
    appState.config.weatherLongitude = String(weather.weatherLongitude || weather.longitude || appState.config.weatherLongitude || '').trim();
    appState.config.weatherTimezone = String(weather.weatherTimezone || weather.timezone || appState.config.weatherTimezone || '').trim();
  }
  const sharedSignalRules = map[SHARED_CONFIG_KEYS.signalRules];
  appState.signalRulesDraft = normalizeSignalRules(sharedSignalRules || appState.config.signalRulesDraft || DEFAULT_SIGNAL_RULES);
  appState.config.signalRulesDraft = normalizeSignalRules(appState.signalRulesDraft);
  const sharedAccounts = map[SHARED_CONFIG_KEYS.calendarAccounts];
  if (Array.isArray(sharedAccounts) && sharedAccounts.length) {
    const mergedAccounts = mergeSharedCalendarAccounts(sharedAccounts, appState.calendarAccounts || []);
    appState.calendarAccounts = mergedAccounts;
    try { localStorage.setItem(CALENDAR_ACCOUNTS_STORAGE, JSON.stringify(mergedAccounts)); } catch {}
  }
  saveConfig(appState.config);
  try { fillSettingsForm(); } catch {}
}

async function upsertSharedConfigEntry(key, value) {
  if (!appState.supabase) throw new Error('Supabase not connected');
  const payload = { key, value, updated_at: new Date(getNowMs()).toISOString() };
  const { error } = await appState.supabase.from(SHARED_CONFIG_TABLE).upsert(payload, { onConflict: 'key' });
  if (error) throw error;
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
  saveConfig(appState.config);
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
  if (!account?.expiresAt) return true;
  return Date.now() > Number(account.expiresAt) - 60 * 1000;
}

function hasPublisherCalendarAccounts() {
  return (appState.calendarAccounts || []).some(account =>
    !!account?.accessToken &&
    !isCalendarAccountExpired(account) &&
    (account.calendars || []).some(cal => cal.selected)
  );
}

async function waitForGoogleIdentity(timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.google?.accounts?.oauth2?.initTokenClient) return window.google.accounts.oauth2;
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
    await new Promise((resolve, reject) => {
      const tokenClient = oauth2.initTokenClient({
        client_id: appState.config.googleClientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        prompt: 'consent select_account',
        callback: async (response) => {
          if (!response || response.error) {
            reject(new Error(response?.error || 'Google authorization failed'));
            return;
          }
          try {
            const accessToken = response.access_token;
            const [userInfo, calendarList] = await Promise.all([
              fetchGoogleUserInfo(accessToken),
              fetchGoogleCalendarList(accessToken),
            ]);
            const existing = appState.calendarAccounts.find(account => account.email === userInfo.email);
            const accountRecord = {
              email: userInfo.email,
              name: userInfo.name || userInfo.email,
              accessToken,
              expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
              calendars: mergeCalendarSelections(existing?.calendars, calendarList),
            };
            const nextAccounts = appState.calendarAccounts.filter(account => account.email !== accountRecord.email);
            nextAccounts.push(accountRecord);
            saveCalendarAccounts(nextAccounts);
            const connectedLabel = stripEmailLikeText(accountRecord.name || '') || accountRecord.email;
            showToast(`Connected ${connectedLabel}`, 'success');
            pushDevLog('info', `Connected Google Calendar account ${connectedLabel}`);
            await refreshAll();
            resolve();
          } catch (error) {
            reject(error);
          }
        },
      });
      tokenClient.requestAccessToken();
    });
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
    saveConfig(appState.config);
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

function renderCalendarAccounts() {
  if (!googleCalendarAccountsEl) return;
  googleCalendarAccountsEl.replaceChildren();
  if (!appState.calendarAccounts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state compact-empty';
    empty.textContent = 'No Google accounts connected yet.';
    googleCalendarAccountsEl.append(empty);
    return;
  }

  for (const account of appState.calendarAccounts) {
    const card = document.createElement('div');
    card.className = 'calendar-account-card';

    const header = document.createElement('div');
    header.className = 'calendar-account-header';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${escapeHtml(account.name || account.email)}</strong><div class="muted">${escapeHtml(account.email || '')}${isCalendarAccountExpired(account) ? ' · reconnect needed' : ''}</div>`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'secondary-button mini-button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      saveCalendarAccounts(appState.calendarAccounts.filter(item => item.email !== account.email));
      refreshAll().catch((error) => console.error('Refresh after removing calendar account failed', error));
    });
    header.append(left, removeButton);
    card.append(header);

    const calList = document.createElement('div');
    calList.className = 'calendar-list';
    for (const calendar of account.calendars || []) {
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
        refreshAll().catch((error) => console.error('Refresh after calendar toggle failed', error));
      });
      const labelText = document.createElement('span');
      labelText.textContent = calendar.summary || calendar.id;
      row.append(checkbox, labelText);
      calList.append(row);
    }
    card.append(calList);
    googleCalendarAccountsEl.append(card);
  }
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

async function fetchGoogleCalendarSnapshots() {
  const canPublish = hasPublisherCalendarAccounts();

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
    pushDevLog('info', existingToday || existingTomorrow
      ? 'Headless calendar mode: using shared snapshots only on this device.'
      : 'Headless calendar mode: no shared calendar snapshots available yet.');
    return;
  }

  await refreshExpiredCalendarTokens();
  const accounts = appState.calendarAccounts || [];
  const expiredAccounts = accounts.filter(isCalendarAccountExpired);
  const selectedSources = accounts
    .filter(account => !isCalendarAccountExpired(account) && !!account.accessToken)
    .flatMap(account => (account.calendars || []).filter(cal => cal.selected).map(calendar => ({ account, calendar })));

  appState.calendarDiagnostics = {
    ...appState.calendarDiagnostics,
    selectedSources: selectedSources.length,
    expiredAccounts: expiredAccounts.length,
    lastError: '',
  };

  const now = getNowDate();
  const todayStart = startOfDay(now);
  const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const dayAfterStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

  const todayItems = [];
  const tomorrowItems = [];
  let fetchedEvents = 0;

  if (!selectedSources.length) {
    pushDevLog('warn', 'Calendar publisher has no selected local calendars. Keeping existing shared snapshots.');
    return;
  }

  pushDevLog('info', `Fetching Google Calendar events from ${selectedSources.length} selected calendar${selectedSources.length === 1 ? '' : 's'} for headless snapshots.`);

  for (const source of selectedSources) {
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

  const sortByStart = (a, b) => String(a.start).localeCompare(String(b.start));
  todayItems.sort(sortByStart);
  tomorrowItems.sort(sortByStart);
  const createdAt = getNowDate().toISOString();

  const todaySnapshot = {
    context_type: appState.config.calendarTodaySnapshotType,
    created_at: createdAt,
    valid_until: new Date(getNowMs() + 15 * 60 * 1000).toISOString(),
    payload: { items: todayItems },
    source: 'headless-google-calendar',
  };
  const tomorrowSnapshot = {
    context_type: appState.config.calendarTomorrowSnapshotType,
    created_at: createdAt,
    valid_until: new Date(getNowMs() + 15 * 60 * 1000).toISOString(),
    payload: { items: tomorrowItems },
    source: 'headless-google-calendar',
  };

  appState.snapshots[appState.config.calendarTodaySnapshotType] = todaySnapshot;
  appState.snapshots[appState.config.calendarTomorrowSnapshotType] = tomorrowSnapshot;

  try {
    if (shouldPublishCalendarSnapshots(todayItems, tomorrowItems)) {
      await publishContextSnapshot(todaySnapshot.context_type, todaySnapshot.payload, todaySnapshot.source, 15);
      await publishContextSnapshot(tomorrowSnapshot.context_type, tomorrowSnapshot.payload, tomorrowSnapshot.source, 15);
      pushDevLog('info', 'Published headless calendar snapshots to household.');
    } else {
      pushDevLog('info', 'Skipped publishing headless calendar snapshots because nothing changed.');
    }
  } catch (error) {
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


function buildTaskDigest() {
  const tasks = normalizeTaskRows();
  const today = getNowDate();
  const todayTasks = tasks.filter((task) => task.dueDate && isSameDay(task.dueDate, today));
  const overdueTasks = tasks.filter((task) => task.dueDate && task.dueDate < startOfDay(today));
  const upcomingTasks = tasks.filter((task) => task.dueDate && task.dueDate > endOfDay(today)).slice(0, 8);
  const undatedTasks = tasks.filter((task) => !task.dueDate);

  const todaySnapshot = getSnapshotPayload(appState.config.calendarTodaySnapshotType);
  const tomorrowSnapshot = getSnapshotPayload(appState.config.calendarTomorrowSnapshotType);
  const calendarTodayItems = Array.isArray(todaySnapshot?.items)
    ? todaySnapshot.items.map((item) => ({
        title: item.title,
        meta: [item.sourceLabel || 'Calendar', item.time].filter(Boolean).join(' · '),
        pill: 'Calendar',
      }))
    : [];
  const calendarTomorrowItems = Array.isArray(tomorrowSnapshot?.items)
    ? tomorrowSnapshot.items.map((item) => ({
        title: item.title,
        meta: [item.sourceLabel || 'Calendar', item.time ? `Tomorrow · ${item.time}` : 'Tomorrow'].filter(Boolean).join(' · '),
        pill: 'Calendar',
      }))
    : [];

  const todayTaskItems = toDisplayTaskItems(todayTasks.length ? todayTasks : undatedTasks.slice(0, 6), 'Today');
  const overdueTaskItems = toDisplayTaskItems(overdueTasks, 'Overdue');
  const upcomingTaskItems = toDisplayTaskItems(upcomingTasks, 'Upcoming');
  const allTaskItems = toDisplayTaskItems(tasks, 'Task');
  const todayBlend = blendTaskAndEventItems(todayTaskItems, calendarTodayItems, overdueTaskItems.slice(0, 2), 8);

  const spotlightTask = overdueTasks[0] || todayTasks[0] || activeSignals().map(signalToItem)[0] || undatedTasks[0] || null;

  return {
    all: tasks,
    allItems: allTaskItems,
    todayTasks: todayTaskItems,
    todayBlend,
    overdueTasks: overdueTaskItems,
    upcomingTasks: upcomingTaskItems,
    calendarTodayItems,
    calendarTomorrowItems,
    allEventItems: [...calendarTodayItems, ...calendarTomorrowItems],
    spotlightTask: spotlightTask ? toDisplayTaskItems([spotlightTask], spotlightTask.kind || 'Task')[0] : null,
    counts: {
      all: tasks.length,
      today: todayTasks.length,
      overdue: overdueTasks.length,
      upcoming: upcomingTasks.length,
      undated: undatedTasks.length,
      eventsToday: calendarTodayItems.length,
    },
  };
}

function blendTaskAndEventItems(taskItems, eventItems, extraItems = [], maxItems = 8) {
  const blended = [];
  const maxLen = Math.max(taskItems.length, eventItems.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (taskItems[i]) blended.push(taskItems[i]);
    if (eventItems[i]) blended.push(eventItems[i]);
    if (blended.length >= maxItems) break;
  }
  for (const item of extraItems) {
    if (blended.length >= maxItems) break;
    blended.push(item);
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
      const dueDate = normalizeDate(task[dateField]);
      const owner = task[ownerField] || '';
      return {
        id: task.id,
        title: String(task[titleField] || 'Untitled task'),
        owner,
        dueDate,
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

function toDisplayTaskItems(tasks, fallbackPill = 'Task') {
  return tasks.map((task) => {
    if (task.signal_type || task.severity) return signalToItem(task);
    const dueMeta = task.dueDate ? formatTaskTiming(task.dueDate) : 'No due date';
    const owner = task.owner || '';
    return {
      title: task.title,
      meta: [owner, dueMeta].filter(Boolean).join(' · '),
      pill: task.dueDate && task.dueDate < startOfDay(getNowDate()) ? 'Overdue' : task.dueDate && isSameDay(task.dueDate, getNowDate()) ? 'Today' : fallbackPill,
      pillClass: task.dueDate && task.dueDate < startOfDay(getNowDate()) ? 'danger' : '',
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


function buildTomorrowEventSignal(rules = getEffectiveSignalRules()) {
  const tomorrowRules = normalizeSignalRules(rules).tomorrowEvent;
  if (!tomorrowRules.enabled) return null;
  const now = getNowDate();
  if (now.getHours() < tomorrowRules.startHour) return null;
  const snapshot = getSnapshotPayload(appState.config.calendarTomorrowSnapshotType);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
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

function activeDbSignals() {
  return appState.signals.filter((signal) => !signal.expires_at || new Date(signal.expires_at) > getNowDate());
}

function didLogEventToday(eventType) {
  const today = getNowDate();
  return appState.logs.some((log) => {
    if (log.event_type !== eventType || !log.created_at) return false;
    const created = new Date(log.created_at);
    return isSameDay(created, today);
  });
}

function buildSyntheticRuleSignals(rules = getEffectiveSignalRules()) {
  const items = [];
  const normalizedRules = normalizeSignalRules(rules);
  const now = getNowDate();
  const day = now.getDay();
  const hour = now.getHours();

  const bins = normalizedRules.bins;
  const binsReminderWindow = bins.enabled && day === bins.dayOfWeek && hour >= bins.startHour;
  const binsDoneToday = didLogEventToday('bins_out');

  if (binsReminderWindow && !binsDoneToday) {
    const dayLabel = DAY_OPTIONS.find(([value]) => Number(value) === bins.dayOfWeek)?.[1] || 'Reminder';
    items.push({
      id: `synthetic-bins-${bins.dayOfWeek}`,
      signal_type: 'bins_weekly',
      title: 'Put bins out tonight',
      description: hour >= bins.escalateHour ? `${dayLabel} night reminder · bins still need to go to the street.` : `${dayLabel} reminder · bins need to go to the street tonight.`,
      severity: hour >= bins.escalateHour ? 'warning' : 'notice',
      location: bins.location || 'outside',
      metadata: { synthetic: true, rule: 'weekly_bins', visible_in: ['tv', 'bedroom', 'kitchen'] },
    });
  }

  const tomorrowEventSignal = buildTomorrowEventSignal(normalizedRules);
  if (tomorrowEventSignal) items.push(tomorrowEventSignal);

  return items;
}

function buildSyntheticCustomSignals(rules = getEffectiveSignalRules()) {
  const normalizedRules = normalizeSignalRules(rules);
  const items = [];
  const now = getNowDate();
  const day = now.getDay();
  const hour = now.getHours();

  for (const rule of normalizedRules.custom) {
    if (!rule.enabled || !rule.name) continue;
    const inSchedule = rule.scheduleType === 'daily'
      ? hour >= rule.startHour
      : day === rule.dayOfWeek && hour >= rule.startHour;
    if (!inSchedule) continue;
    if (rule.clearMode === 'log_event_today' && rule.ackEventType && didLogEventToday(rule.ackEventType)) continue;
    const isWarning = rule.escalateToWarning && hour >= rule.escalateHour;
    const descriptionParts = [];
    if (rule.scheduleType === 'weekly') {
      descriptionParts.push(`${DAY_OPTIONS.find(([value]) => Number(value) === rule.dayOfWeek)?.[1] || 'Weekly'} from ${formatHourLabel(rule.startHour)}`);
    } else {
      descriptionParts.push(`Daily from ${formatHourLabel(rule.startHour)}`);
    }
    if (rule.clearMode === 'log_event_today' && rule.ackEventType) {
      descriptionParts.push(`ack with ${rule.ackEventType}`);
    }
    items.push({
      id: `synthetic-custom-${rule.id}`,
      signal_type: 'custom_rule',
      title: rule.name,
      description: descriptionParts.join(' · '),
      severity: isWarning ? 'warning' : 'notice',
      location: rule.location || 'custom',
      metadata: { synthetic: true, rule: 'custom_signal', customRuleId: rule.id },
    });
  }

  return items;
}

function buildSyntheticLaundrySignals(rules = getEffectiveSignalRules()) {
  const items = [];
  const normalizedRules = normalizeSignalRules(rules);
  if (!normalizedRules.laundry.enabled) return items;
  const activeLoads = appState.loads.filter((load) => !load.archived_at && load.status !== 'done');
  if (activeLoads.length) {
    const readyCount = activeLoads.filter((load) => load.status === 'ready').length;
    const dryingCount = activeLoads.filter((load) => load.status === 'drying').length;
    const washingCount = activeLoads.filter((load) => load.status === 'washing').length;
    const detailParts = [];
    if (washingCount) detailParts.push(`${washingCount} washing`);
    if (dryingCount) detailParts.push(`${dryingCount} drying`);
    if (readyCount) detailParts.push(`${readyCount} ready`);
    items.push({
      id: 'synthetic-laundry-active',
      signal_type: 'laundry_active',
      title: activeLoads.length === 1 ? 'Laundry load in progress' : 'Laundry in progress',
      description: detailParts.join(' · ') || `${activeLoads.length} active load${activeLoads.length === 1 ? '' : 's'}`,
      severity: readyCount ? 'warning' : 'notice',
      location: 'laundry',
      metadata: { synthetic: true },
    });
  }
  return items;
}

function activeSignals(rules = getEffectiveSignalRules()) {
  return [...activeDbSignals(), ...buildSyntheticLaundrySignals(rules), ...buildSyntheticRuleSignals(rules), ...buildSyntheticCustomSignals(rules)];
}

function buildForgetItems() {
  const items = [];
  const topSignals = activeSignals().slice(0, 3);
  for (const signal of topSignals) items.push(signalToItem(signal));
  if (!items.length) {
    const tomorrow = buildTomorrowItems()[0];
    if (tomorrow) items.push(tomorrow);
  }
  return items.slice(0, 4);
}

function buildSoftFocus() {
  const digest = buildTaskDigest();
  if (digest.spotlightTask) return digest.spotlightTask;
  const topSignal = activeSignals()[0];
  if (topSignal) return { title: topSignal.title, meta: topSignal.description || 'Gentle attention item' };
  return null;
}

function buildTomorrowItems() {
  const snapshot = getSnapshotPayload(appState.config.calendarTomorrowSnapshotType);
  const tasks = normalizeTaskRows()
    .filter((task) => task.dueDate && isTomorrow(task.dueDate))
    .slice(0, 3);

  const taskItems = toDisplayTaskItems(tasks, 'Tomorrow');
  const events = Array.isArray(snapshot?.items)
    ? snapshot.items.slice(0, 3).map((item) => ({ title: item.title, meta: [item.sourceLabel || 'Calendar', item.time].filter(Boolean).join(' · '), pill: 'Calendar' }))
    : [];

  return [...events, ...taskItems].slice(0, 5);
}

function signalToItem(signal) {
  return {
    title: signal.title,
    meta: signal.description || signal.location || '',
    pill: capitalize(signal.severity),
    pillClass: signal.severity === 'warning' ? 'warning' : '',
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

function showToast(message, type = 'info') {
  const host = ensureToastHost();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  host.append(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  window.setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    window.setTimeout(() => toast.remove(), 220);
  }, 1700);
}

function pulseButton(button) {
  if (!button) return;
  button.classList.remove('quick-button-hit');
  void button.offsetWidth;
  button.classList.add('quick-button-hit');
}

async function createQuickLog(item, button) {
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
  try {
    const payload = {
      label: null,
      status: 'washing',
      started_by: guessActor(),
      machine: 'washer',
      metadata: {},
    };
    const { error } = await appState.supabase.from('laundry_loads').insert(payload);
    if (error) throw error;
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
  refreshAll().catch((error) => console.error('Refresh after setting test time failed', error));
  renderDevConsole();
}

function clearTestTimeOverride() {
  appState.testTimeOverride = null;
  saveTestTimeOverride(null);
  if (testTimeInput) testTimeInput.value = '';
  pushDevLog('info', 'Cleared test time override.');
  showToast('Returned to real time', 'success');
  refreshAll().catch((error) => console.error('Refresh after clearing test time failed', error));
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
      setConnectionStatus('realtime', 'ok', 'Configured in app');
    } else {
      setConnectionStatus('realtime', 'warn', 'Check task access first');
    }
    pushDevLog('info', 'Connection test completed.');
  } catch (error) {
    setConnectionStatus('supabase', 'error', error?.message || 'Could not initialize client');
    setConnectionStatus('tasks', 'unknown', 'Not tested');
    setConnectionStatus('deviceProfile', 'unknown', 'Not tested');
    setConnectionStatus('realtime', 'unknown', 'Not tested');
    pushDevLog('error', `Connection test failed: ${error?.message || error}`);
  }
}

function renderDevConsole() {
  const timeMeta = appState.testTimeOverride ? ` · test time ${new Date(appState.testTimeOverride).toLocaleString()}` : '';
  const activeCalendarCount = appState.calendarAccounts.reduce((sum, account) => sum + (account.calendars || []).filter(cal => cal.selected).length, 0);
  const eventCount = (appState.calendarDiagnostics.mergedToday || 0) + (appState.calendarDiagnostics.mergedTomorrow || 0);
  devConsoleMetaEl.textContent = `${APP_VERSION} · ${appState.config.mode} · tasks ${appState.tasks.length} · signals ${appState.signals.length} · loads ${appState.loads.length} · calendars ${activeCalendarCount} · events ${eventCount}${timeMeta}`;
  devConsoleLogEl.replaceChildren();
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

function setupButtons() {
  pushDevLog('info', 'Button handlers attached.');
  settingsButton.onclick = openSettingsDialog;
  refreshButton.onclick = async () => {
    try {
      await refreshAll();
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
    saveConfig(appState.config);
    fillSettingsForm();
    resetAutoRefreshTimer();
    closeSettingsDialog();
    clearSubscriptions();
    await ensureSupabase();
    await upsertDeviceProfile();
    await refreshAll();
    bindRealtime();
  };
}

async function upsertDeviceProfile() {
  if (!appState.supabase) return;
  const payload = {
    device_name: appState.config.deviceName,
    device_key: appState.deviceKey,
    mode: appState.config.mode,
    location: appState.config.location,
    settings: {},
    is_active: true,
  };
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
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_STORAGE, JSON.stringify(config));
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

function getSnapshot(type) {
  return appState.snapshots[type] || null;
}

function getSnapshotPayload(type) {
  return getSnapshot(type)?.payload || null;
}

function snapshotFreshnessPill(snapshot, fallback = 'Live') {
  if (!snapshot) return fallback;
  if (snapshot.valid_until && new Date(snapshot.valid_until) < getNowDate()) return 'Stale';
  return fallback;
}

function snapshotFreshnessClass(snapshot) {
  if (!snapshot) return '';
  if (snapshot.valid_until && new Date(snapshot.valid_until) < getNowDate()) return 'warning';
  return '';
}

function snapshotMetaLabel(prefix, snapshot) {
  if (!snapshot) return prefix;
  return `${prefix} · ${relativeTime(snapshot.created_at)}`;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function endOfDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
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
  const refreshSeconds = Math.max(15, Number(appState.config.uiRefreshSeconds) || DEFAULT_CONFIG.uiRefreshSeconds);
  autoRefreshTimer = window.setInterval(() => {
    if (!appState.supabase || document.hidden) return;
    pushDevLog('info', `Auto refresh fired (${refreshSeconds}s)`);
    refreshAll();
  }, refreshSeconds * 1000);
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      if (registration && registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }
}

resetAutoRefreshTimer();


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



/* v1.2.3-dev calendar auth status helpers */
(function () {
  const originalInit = window.initCalendarDiagnostics;
  const originalRenderMobileStatus = window.renderMobileStatus;
  const originalRenderMobileCalendar = window.renderMobileCalendar;
  const originalOpenModalList = window.openModalList;

  function getCalendarAccountsSafe() {
    const state = window.appState || {};
    if (Array.isArray(state.googleAccounts)) return state.googleAccounts;
    if (Array.isArray(state.calendarAccounts)) return state.calendarAccounts;
    if (Array.isArray(state.googleCalendarAccounts)) return state.googleCalendarAccounts;
    return [];
  }

  function summarizeCalendarAuthState() {
    const requirement = getCalendarAuthRequirementState();
    return {
      total: requirement.totalRequired,
      connected: requirement.connected,
      expired: requirement.needsReconnect,
      needsReconnect: requirement.needsReconnect,
      details: requirement.details.map((item, idx) => ({
        name: item.name || item.email || `Account ${idx + 1}`,
        status: item.connected ? 'Connected' : 'Needs reconnect',
      })),
      hasProblem: requirement.needsReconnect > 0 || requirement.totalRequired === 0,
    };
  }

  window.summarizeCalendarAuthState = summarizeCalendarAuthState;

  window.renderCalendarAuthBanner = function renderCalendarAuthBanner() {
    const summary = summarizeCalendarAuthState();
    const el = document.getElementById('calendar-auth-banner');
    if (!el) return;
    const isMobileMode = (appState?.config?.mode || '') === 'mobile';
    if (!isMobileMode) {
      el.style.display = 'none';
      return;
    }
    if (!summary.total) {
      el.innerHTML = '<div class="auth-banner auth-banner-warn"><strong>Calendar not connected.</strong> Use Mobile → Calendar to connect this device.</div>';
      el.style.display = 'block';
      return;
    }
    if (summary.needsReconnect > 0) {
      el.innerHTML = '<div class="auth-banner auth-banner-warn"><strong>Calendar needs reconnect on this device.</strong> ' +
        summary.needsReconnect + ' account(s) need sign-in again. Open Mobile → Calendar and reconnect.</div>';
      el.style.display = 'block';
      return;
    }
    el.style.display = 'none';
  };

  window.openCalendarReconnectHelp = function openCalendarReconnectHelp() {
    const summary = summarizeCalendarAuthState();
    const items = [];
    if (!summary.total) {
      items.push('No Google Calendar accounts connected on this device yet.');
    } else {
      summary.details.forEach(d => items.push(`${d.name} — ${d.status}`));
    }
    items.push('Reconnect path: Mobile → Calendar → Add Google account / reconnect.');
    if (typeof window.openModalList === 'function') {
      window.openModalList('Calendar connection status', items);
    } else {
      alert(items.join('\n'));
    }
  };

  window.getCalendarEmptyStateMessage = function getCalendarEmptyStateMessage() {
    const summary = summarizeCalendarAuthState();
    if (!summary.total) return 'No calendar accounts connected on this device yet.';
    if (summary.needsReconnect > 0) return 'Calendar needs reconnect on this device.';
    return 'No events loaded.';
  };

  document.addEventListener('DOMContentLoaded', function () {
    try {
      const app = document.getElementById('app');
      if (app && !document.getElementById('calendar-auth-banner')) {
        const banner = document.createElement('div');
        banner.id = 'calendar-auth-banner';
        banner.className = 'calendar-auth-banner-slot';
        app.prepend(banner);
      }
    } catch (e) {}
    setTimeout(() => {
      try { window.renderCalendarAuthBanner && window.renderCalendarAuthBanner(); } catch (e) {}
    }, 400);
  });

  if (typeof originalRenderMobileStatus === 'function') {
    window.renderMobileStatus = function wrappedRenderMobileStatus() {
      const result = originalRenderMobileStatus.apply(this, arguments);
      try { window.renderCalendarAuthBanner && window.renderCalendarAuthBanner(); } catch (e) {}
      return result;
    };
  }

  if (typeof originalRenderMobileCalendar === 'function') {
    window.renderMobileCalendar = function wrappedRenderMobileCalendar() {
      const result = originalRenderMobileCalendar.apply(this, arguments);
      try {
        const container = document.querySelector('[data-mobile-tab="calendar"], #mobile-calendar-tab, #calendar-tab');
        const summary = summarizeCalendarAuthState();
        if (container && !container.querySelector('.calendar-auth-card')) {
          const card = document.createElement('div');
          card.className = 'mobile-card calendar-auth-card';
          card.innerHTML = `
            <div class="mobile-card-title">This device’s calendar connection</div>
            <div class="calendar-auth-summary"></div>
            <div class="calendar-auth-actions">
              <button class="secondary-button" id="calendar-reconnect-help-btn">Reconnect help</button>
            </div>
          `;
          container.prepend(card);
          card.querySelector('#calendar-reconnect-help-btn').addEventListener('click', window.openCalendarReconnectHelp);
        }
        const summaryEl = container && container.querySelector('.calendar-auth-summary');
        if (summaryEl) {
          if (!summary.total) {
            summaryEl.innerHTML = '<div class="auth-inline warn">No accounts connected on this device.</div>';
          } else if (summary.needsReconnect > 0) {
            summaryEl.innerHTML = `<div class="auth-inline warn">${summary.needsReconnect} account(s) need reconnect on this device.</div>`;
          } else {
            summaryEl.innerHTML = `<div class="auth-inline ok">${summary.connected} connected account(s) ready on this device.</div>`;
          }
        }
      } catch (e) {}
      return result;
    };
  }

  // Patch common empty-state text if present in runtime helpers
  const originalRenderEventsQuickView = window.renderEventsQuickView;
  if (typeof originalRenderEventsQuickView === 'function') {
    window.renderEventsQuickView = function wrappedEventsQuickView() {
      const result = originalRenderEventsQuickView.apply(this, arguments);
      return result;
    };
  }

  // Expose to other renderers
  window.refreshCalendarAuthIndicators = function () {
    try { window.renderCalendarAuthBanner && window.renderCalendarAuthBanner(); } catch (e) {}
    try { window.renderMobileCalendar && window.renderMobileCalendar(); } catch (e) {}
  };
})();
