const APP_VERSION = 'v0.7.4-dev';
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
};

const DEVICE_KEY_STORAGE = 'household-command-center-device-key';
const CONFIG_STORAGE = 'household-command-center-config';
const SETTINGS_JSON_AUTOLOAD_DONE = 'household-command-center-settings-json-autoload-done';
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

let autoRefreshTimer = null;

const DEFAULT_CONNECTION_STATUS = {
  supabase: { level: 'unknown', text: 'Not tested' },
  tasks: { level: 'unknown', text: 'Not tested' },
  deviceProfile: { level: 'unknown', text: 'Not tested' },
  realtime: { level: 'unknown', text: 'Not tested' },
};

let appState = {
  config: loadConfig(),
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
const testConnectionButton = document.getElementById('test-connection-button');
const connectionStatusGrid = document.getElementById('connection-status-grid');

let bootstrapPromise = null;

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
  appState.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
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
    renderMode();
    renderDevConsole();
    setStatus(`Showing ${appState.config.mode} mode · Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
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
    appState.snapshots = {};
    return;
  }
  const snapshots = {};
  for (const item of data || []) {
    if (!snapshots[item.context_type]) snapshots[item.context_type] = item;
  }
  appState.snapshots = snapshots;
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
    { table: 'context_snapshots', event: '*', handler: refreshAll },
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
      'kitchenHeader',
      'today',
      'spotlight',
      'signals',
      'upcoming',
      'quickActions',
      'forget',
      'context',
      'taskMapping',
    ],
  },
  tv: {
    screenClass: 'screen single-column widget-layout widget-layout-tv',
    widgets: ['tvHero', 'tvToday', 'tvSignals', 'tvFocus'],
  },
  laundry: {
    screenClass: 'screen single-column widget-layout widget-layout-laundry',
    widgets: ['laundryLoads', 'laundrySignals'],
  },
  bedroom: {
    screenClass: 'screen single-column bedroom-layout widget-layout widget-layout-bedroom',
    widgets: ['bedroomPrimary', 'bedroomForget', 'context'],
  },
  mobile: {
    screenClass: 'screen two-columns widget-layout widget-layout-mobile',
    widgets: ['today', 'laundryLoads', 'upcoming', 'recentLogs', 'signals', 'quickActions', 'context', 'taskMapping'],
  },
};

function renderMode() {
  const mode = appState.config.mode || 'tv';
  document.body.classList.toggle('tv-mode', mode === 'tv');
  const digest = buildTaskDigest();
  const widgetContext = buildWidgetContext(digest);
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
  kitchenHeader: (context) => buildCard('Today', buildKitchenHeadline(context.digest), renderTaskList(context.digest.todayTasks, 'Nothing important for today yet.', { showPills: true })),
  today: (context) => buildCard('Today', '', renderTaskList(context.digest.todayTasks, 'No tasks visible.', { showPills: true })),
  spotlight: (context) => buildCard('Task Spotlight', 'Best next task from the board', renderSpotlightCard(context.digest.spotlightTask)),
  signals: (context) => buildCard('Needs Attention', `${context.signals.length} visible`, renderList(context.signals.slice(0, 6).map(signalToItem), 'Everything looks calm right now.')),
  upcoming: (context) => buildCard('Upcoming Tasks', `${context.digest.upcomingTasks.length} coming soon`, renderTaskList(context.digest.upcomingTasks, 'Nothing is queued up soon.', { showPills: true })),
  quickActions: () => buildQuickActionsCard(),
  forget: (context) => buildCard('Overdue & Don’t Forget', 'Short and important', renderTaskList(context.digest.overdueTasks.slice(0, 6).concat(context.forgetItems.slice(0, 2)), 'Nothing critical is waiting.', { showPills: true })),
  context: () => buildCard('Weather & Next Event', '', renderContextStack()),
  taskMapping: () => buildCard('Task Mapping', 'Live field mapping for this board', renderTaskMappingSummary()),
  tvHero: () => buildTvHero(),
  tvToday: (context) => buildCard('Today', '', renderTaskList(buildTvTodayItems(context), 'Nothing major on the board.', { compact: true, showPills: true }), 'tv-card'),
  tvSignals: (context) => buildCard('Attention', '', renderList(context.signals.slice(0, 3).map(signalToItem), 'House is in a good place.'), 'tv-card'),
  tvFocus: (context) => buildCard(context.isEvening ? 'Tomorrow' : 'Focus', '', context.isEvening ? renderTaskList(context.tomorrowItems, 'Tomorrow is still open.', { compact: true, showPills: true }) : renderFocusBlock(context.focusItem), 'tv-card'),
  laundryLoads: () => buildCard('Laundry', 'Track each load at a glance', renderLaundryLoads()),
  laundrySignals: (context) => buildCard('Light House Signals', '', renderList(context.signals.slice(0, 2).map(signalToItem), 'Laundry is the main thing here.')),
  bedroomPrimary: (context) => buildCard(context.isEvening ? 'Tomorrow' : 'Today', describeDateContext(), renderTaskList(context.isEvening ? context.tomorrowItems : context.digest.todayTasks.slice(0, 5), `Nothing big for ${(context.isEvening ? 'tomorrow' : 'today')} yet.`, { showPills: true })),
  bedroomForget: (context) => buildCard('Don’t Forget', 'Gentle reminders', renderTaskList(context.forgetItems, 'No key reminders right now.', { showPills: true })),
  recentLogs: () => buildCard('Recent Logs', '', renderList(appState.logs.map(logToItem), 'No quick logs yet.')),
};

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
  date.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const timeEl = document.createElement('div');
  timeEl.className = 'tv-clock';
  timeEl.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  topRow.append(date, timeEl);

  const contextRow = document.createElement('div');
  contextRow.className = 'tv-context-row';

  const weatherEl = document.createElement('div');
  weatherEl.className = 'tv-weather';
  weatherEl.textContent = weather?.payload?.summary || 'Weather snapshot not loaded yet';

  const nextEl = document.createElement('div');
  nextEl.className = 'tv-next';
  nextEl.textContent = nextEvent ? `Next: ${nextEvent.title}${nextEvent.time ? ` · ${nextEvent.time}` : ''}` : 'Nothing urgent on the calendar';

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
    ? todaySnapshot.items.slice(0, 2).map((item) => ({
        title: item.title,
        meta: item.time ? `Event · ${item.time}` : 'Event',
        pill: 'Calendar',
      }))
    : [];

  const taskItems = context.digest.todayTasks.slice(0, 2);
  const overdueItems = context.digest.overdueTasks.slice(0, 1);

  const blended = [];
  if (taskItems[0]) blended.push(taskItems[0]);
  if (eventItems[0]) blended.push(eventItems[0]);
  if (taskItems[1]) blended.push(taskItems[1]);
  if (eventItems[1]) blended.push(eventItems[1]);
  if (overdueItems[0]) blended.push(overdueItems[0]);

  return blended.slice(0, 4);
}

function buildQuickActionsCard() {
  const wrap = document.createElement('div');
  wrap.className = 'quick-grid';
  for (const item of QUICK_LOGS) {
    const button = document.createElement('button');
    button.className = 'quick-button';
    button.textContent = item.label;
    button.addEventListener('click', () => createQuickLog(item));
    wrap.append(button);
  }
  return buildCard('Quick Actions', 'One tap, then done', wrap);
}

function renderLaundryLoads() {
  const wrapper = document.createElement('div');
  wrapper.className = 'list';

  const loads = [...appState.loads];
  if (!loads.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No active loads right now.';
    wrapper.append(empty);
  } else {
    for (const load of loads) {
      const row = document.createElement('button');
      row.className = 'load-row load-button';
      row.innerHTML = `
        <div>
          <div class="list-item-title">${escapeHtml(load.label || `Load ${load.id.slice(0, 4)}`)}</div>
          <div class="list-item-meta">Last moved ${relativeTime(load.last_transition_at || load.updated_at || load.created_at)}</div>
        </div>
        <span class="pill">${escapeHtml(capitalize(load.status))}</span>
      `;
      row.addEventListener('click', () => advanceLoad(load));
      wrapper.append(row);
    }
  }

  const addButton = document.createElement('button');
  addButton.className = 'primary-button';
  addButton.textContent = 'Start new load';
  addButton.addEventListener('click', createLoad);
  wrapper.append(addButton);
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
      title: weather.payload.summary,
      meta: snapshotMetaLabel('Weather', weather),
      pill: snapshotFreshnessPill(weather),
      pillClass: snapshotFreshnessClass(weather),
    });
  }
  const next = Array.isArray(todayCal?.payload?.items) ? todayCal.payload.items[0] : null;
  if (next) {
    items.push({
      title: next.title,
      meta: next.time ? `${snapshotMetaLabel('Next event', todayCal)} · ${next.time}` : snapshotMetaLabel('Next event', todayCal),
      pill: snapshotFreshnessPill(todayCal, 'Calendar'),
      pillClass: snapshotFreshnessClass(todayCal),
    });
  }
  return renderTaskList(items, 'Weather and calendar snapshots are ready to plug in later.', { showPills: true });
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
  const today = new Date();
  const todayTasks = tasks.filter((task) => task.dueDate && isSameDay(task.dueDate, today));
  const overdueTasks = tasks.filter((task) => task.dueDate && task.dueDate < startOfDay(today));
  const upcomingTasks = tasks.filter((task) => task.dueDate && task.dueDate > endOfDay(today)).slice(0, 8);
  const undatedTasks = tasks.filter((task) => !task.dueDate);
  const spotlightTask = overdueTasks[0] || todayTasks[0] || activeSignals().map(signalToItem)[0] || undatedTasks[0] || null;

  return {
    all: tasks,
    todayTasks: toDisplayTaskItems(todayTasks.length ? todayTasks : undatedTasks.slice(0, 6), 'Today'),
    overdueTasks: toDisplayTaskItems(overdueTasks, 'Overdue'),
    upcomingTasks: toDisplayTaskItems(upcomingTasks, 'Upcoming'),
    spotlightTask: spotlightTask ? toDisplayTaskItems([spotlightTask], spotlightTask.kind || 'Task')[0] : null,
    counts: {
      all: tasks.length,
      today: todayTasks.length,
      overdue: overdueTasks.length,
      upcoming: upcomingTasks.length,
      undated: undatedTasks.length,
    },
  };
}

function normalizeTaskRows() {
  const dateField = appState.config.taskDateField;
  const titleField = appState.config.taskTitleField;
  const ownerField = appState.config.taskOwnerField;
  const actor = guessActor();

  return appState.tasks
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
      pill: task.dueDate && task.dueDate < startOfDay(new Date()) ? 'Overdue' : task.dueDate && isSameDay(task.dueDate, new Date()) ? 'Today' : fallbackPill,
      pillClass: task.dueDate && task.dueDate < startOfDay(new Date()) ? 'danger' : '',
    };
  });
}

function buildKitchenHeadline(digest) {
  const parts = [];
  if (digest.counts.today) parts.push(`${digest.counts.today} today`);
  if (digest.counts.overdue) parts.push(`${digest.counts.overdue} overdue`);
  if (digest.counts.upcoming) parts.push(`${digest.counts.upcoming} upcoming`);
  if (!parts.length) parts.push(`${digest.counts.all} open tasks`);
  return parts.join(' · ');
}

function activeSignals() {
  return appState.signals.filter((signal) => !signal.expires_at || new Date(signal.expires_at) > new Date());
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
    ? snapshot.items.slice(0, 3).map((item) => ({ title: item.title, meta: item.time ? `Event · ${item.time}` : 'Event', pill: 'Calendar' }))
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

async function createQuickLog(item) {
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
    setStatus(`Logged: ${item.label}`);
  } catch (error) {
    console.error(error);
    setStatus(`Could not log action: ${error.message}`);
  }
}

async function createLoad() {
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
    setStatus('Started a new laundry load.');
  } catch (error) {
    console.error(error);
    setStatus(`Could not start load: ${error.message}`);
  }
}

async function advanceLoad(load) {
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
    setStatus(`Laundry load moved to ${nextStatus}.`);
  } catch (error) {
    console.error(error);
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
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
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
  console.info(`Household Command Center ${APP_VERSION} booting`);
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
    status: statusLine.textContent,
    time: new Date().toISOString(),
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
    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
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
  devConsoleMetaEl.textContent = `${APP_VERSION} · ${appState.config.mode} · tasks ${appState.tasks.length} · signals ${appState.signals.length} · loads ${appState.loads.length}`;
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
  saveSettingsButton.onclick = async (event) => {
    event.preventDefault();
    appState.config = readSettingsUi();
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

function describeDateContext() {
  const weather = getSnapshotPayload(appState.config.weatherSnapshotType);
  return weather?.summary || new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function getSnapshot(type) {
  return appState.snapshots[type] || null;
}

function getSnapshotPayload(type) {
  return getSnapshot(type)?.payload || null;
}

function snapshotFreshnessPill(snapshot, fallback = 'Live') {
  if (!snapshot) return fallback;
  if (snapshot.valid_until && new Date(snapshot.valid_until) < new Date()) return 'Stale';
  return fallback;
}

function snapshotFreshnessClass(snapshot) {
  if (!snapshot) return '';
  if (snapshot.valid_until && new Date(snapshot.valid_until) < new Date()) return 'warning';
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
  if (isSameDay(date, new Date())) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return formatDate(date);
}

function relativeTime(value) {
  if (!value) return 'just now';
  const deltaMs = Date.now() - new Date(value).getTime();
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
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(date, tomorrow);
}

function isEvening() {
  const hour = new Date().getHours();
  return hour >= 16;
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
