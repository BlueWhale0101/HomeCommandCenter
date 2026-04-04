const APP_VERSION = 'v0.1.0-dev';

const DEFAULT_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
  deviceName: 'New device',
  mode: 'kitchen',
  location: 'kitchen',
  taskTable: 'tasks',
  taskDateField: 'due_date',
  taskOwnerField: 'owner',
  taskTitleField: 'task',
  taskCompletedField: 'done',
  taskCompletedValue: 'true',
  useStringCompleted: false,
  weatherSnapshotType: 'weather_today',
  calendarTodaySnapshotType: 'calendar_today',
  calendarTomorrowSnapshotType: 'calendar_tomorrow',
  uiRefreshSeconds: 60,
};

const DEVICE_KEY_STORAGE = 'household-command-center-device-key';
const CONFIG_STORAGE = 'household-command-center-config';
const QUICK_LOGS = [
  { label: 'Kitchen cleaned', eventType: 'kitchen_cleaned', location: 'kitchen' },
  { label: 'Dishes done', eventType: 'dishes_done', location: 'kitchen' },
  { label: 'Bins out', eventType: 'bins_out', location: 'outside' },
  { label: 'Laundry done', eventType: 'laundry_done', location: 'laundry' },
];
const LOAD_STATUS_ORDER = ['washing', 'drying', 'ready', 'done'];

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
};

const screenEl = document.getElementById('screen');
const statusLine = document.getElementById('status-line');
const settingsButton = document.getElementById('settings-button');
const refreshButton = document.getElementById('refresh-button');
const settingsDialog = document.getElementById('settings-dialog');
const saveSettingsButton = document.getElementById('save-settings');
const versionTag = document.getElementById('version-tag');
const devConsoleButton = document.getElementById('dev-console-button');
const devConsoleEl = document.getElementById('dev-console');
const devConsoleLogEl = document.getElementById('dev-console-log');
const devConsoleMetaEl = document.getElementById('dev-console-meta');
const closeConsoleButton = document.getElementById('close-console-button');
const clearConsoleButton = document.getElementById('clear-console-button');
const copyDiagnosticsButton = document.getElementById('copy-diagnostics-button');

setupVersionUi();
setupDevConsole();
setupSettingsUi();
setupButtons();
registerServiceWorker();
bootstrap();

async function bootstrap() {
  setStatus('Loading household command center…');
  await ensureSupabase();
  if (!appState.supabase) {
    renderEmptyShell('Open Settings and add your Supabase URL and anon key to start.');
    return;
  }
  await loadDeviceProfile();
  await refreshAll();
  bindRealtime();
}

async function ensureSupabase() {
  const { supabaseUrl, supabaseKey } = appState.config;
  if (!supabaseUrl || !supabaseKey) {
    setStatus('Supabase settings needed.');
    return;
  }
  appState.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
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
  if (!appState.supabase) return;
  setStatus(`Refreshing ${appState.config.mode} view…`);
  await Promise.all([
    fetchTasks(),
    fetchSignals(),
    fetchLoads(),
    fetchSnapshots(),
    fetchRecentLogs(),
  ]);
  renderMode();
  setStatus(`Showing ${appState.config.mode} mode · Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
}

async function fetchTasks() {
  const { taskTable } = appState.config;
  let query = appState.supabase.from(taskTable).select('*').limit(80);
  const completedField = appState.config.taskCompletedField;
  if (completedField) {
    if (appState.config.useStringCompleted) {
      query = query.neq(completedField, appState.config.taskCompletedValue);
    } else {
      query = query.eq(completedField, false);
    }
  }
  const { data, error } = await query;
  if (error) {
    console.warn('Task fetch issue', error);
    appState.tasks = [];
    return;
  }
  appState.tasks = data || [];
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

function renderMode() {
  document.body.classList.toggle('tv-mode', appState.config.mode === 'tv');
  switch (appState.config.mode) {
    case 'tv':
      renderTvMode();
      break;
    case 'laundry':
      renderLaundryMode();
      break;
    case 'bedroom':
      renderBedroomMode();
      break;
    case 'mobile':
      renderMobileMode();
      break;
    case 'kitchen':
    default:
      renderKitchenMode();
      break;
  }
}

function renderKitchenMode() {
  screenEl.className = 'screen two-columns';
  screenEl.replaceChildren(
    buildCard('Today', describeDateContext(), renderList(normalizeTodayItems(), 'Nothing important for today yet.')),
    buildCard('Needs Attention', `${activeSignals().length} visible`, renderList(activeSignals().slice(0, 6).map(signalToItem), 'Everything looks calm right now.')),
    buildCard('Don’t Forget', 'Short and important', renderList(buildForgetItems(), 'Nothing critical is waiting.')),
    buildQuickActionsCard(),
    buildCard('If you’ve got a minute', 'Gentle next suggestion', renderFocusBlock(buildSoftFocus())),
    buildCard('Weather & Next Event', '', renderContextStack()),
  );
}

function renderTvMode() {
  screenEl.className = 'screen single-column';
  const wrap = document.createElement('div');
  wrap.className = 'tv-layout';
  wrap.append(
    buildTvHero(),
    buildCard('Today', '', renderList(normalizeTodayItems().slice(0, 4), 'Nothing major on the board.'), 'tv-card'),
    buildCard('Attention', '', renderList(activeSignals().slice(0, 3).map(signalToItem), 'House is in a good place.'), 'tv-card'),
    buildCard(isEvening() ? 'Tomorrow' : 'Focus', '', isEvening() ? renderList(buildTomorrowItems(), 'Tomorrow is still open.') : renderFocusBlock(buildSoftFocus()), 'tv-card'),
  );
  screenEl.append(wrap);
}

function renderLaundryMode() {
  screenEl.className = 'screen single-column';
  screenEl.replaceChildren(
    buildCard('Laundry', 'Track each load at a glance', renderLaundryLoads()),
    buildCard('Light House Signals', '', renderList(activeSignals().slice(0, 2).map(signalToItem), 'Laundry is the main thing here.')),
  );
}

function renderBedroomMode() {
  screenEl.className = 'screen single-column bedroom-layout';
  const title = isEvening() ? 'Tomorrow' : 'Today';
  const items = isEvening() ? buildTomorrowItems() : normalizeTodayItems().slice(0, 5);
  screenEl.replaceChildren(
    buildCard(title, describeDateContext(), renderList(items, `Nothing big for ${title.toLowerCase()} yet.`)),
    buildCard('Don’t Forget', 'Gentle reminders', renderList(buildForgetItems(), 'No key reminders right now.')),
    buildCard('Weather & Next Event', '', renderContextStack()),
  );
}

function renderMobileMode() {
  screenEl.className = 'screen two-columns';
  screenEl.replaceChildren(
    buildCard('Today', '', renderList(normalizeTodayItems(), 'No tasks visible.')),
    buildCard('Laundry', '', renderLaundryLoads()),
    buildCard('Recent Logs', '', renderList(appState.logs.map(logToItem), 'No quick logs yet.')),
    buildCard('Signals', '', renderList(activeSignals().map(signalToItem), 'No active signals.')),
    buildQuickActionsCard(),
    buildCard('Context', '', renderContextStack()),
  );
}

function buildTvHero() {
  const section = document.createElement('section');
  section.className = 'card tv-card tv-hero';
  const weather = getSnapshotPayload(appState.config.weatherSnapshotType);
  const todayCal = getSnapshotPayload(appState.config.calendarTodaySnapshotType);
  const nextEvent = Array.isArray(todayCal?.items) ? todayCal.items[0] : null;

  const date = document.createElement('div');
  date.className = 'tv-date';
  date.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const weatherEl = document.createElement('div');
  weatherEl.className = 'tv-weather';
  weatherEl.textContent = weather?.summary || 'Weather snapshot not loaded yet';

  const nextEl = document.createElement('div');
  nextEl.className = 'focus-text';
  nextEl.textContent = nextEvent ? `Next: ${nextEvent.title}${nextEvent.time ? ` · ${nextEvent.time}` : ''}` : 'Nothing urgent on the calendar';

  section.append(date, weatherEl, nextEl);
  return section;
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
  const wrapper = document.createElement('div');
  wrapper.className = 'list';
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
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = item.title;
    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    meta.textContent = item.meta || '';
    left.append(title, meta);

    row.append(left);
    if (item.pill) {
      const pill = document.createElement('span');
      pill.className = `pill ${item.pillClass || ''}`.trim();
      pill.textContent = item.pill;
      row.append(pill);
    }
    wrapper.append(row);
  }
  return wrapper;
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
  const wrap = document.createElement('div');
  wrap.className = 'list';
  const weather = getSnapshotPayload(appState.config.weatherSnapshotType);
  const todayCal = getSnapshotPayload(appState.config.calendarTodaySnapshotType);
  const items = [];
  if (weather?.summary) items.push({ title: weather.summary, meta: 'Weather' });
  const next = Array.isArray(todayCal?.items) ? todayCal.items[0] : null;
  if (next) items.push({ title: next.title, meta: next.time ? `Next event · ${next.time}` : 'Next event' });
  return renderList(items, 'Weather and calendar snapshots are ready to plug in later.');
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

function normalizeTodayItems() {
  const dateField = appState.config.taskDateField;
  const titleField = appState.config.taskTitleField;
  const ownerField = appState.config.taskOwnerField;
  const today = new Date();
  return appState.tasks
    .map((task) => {
      const rawDate = task[dateField];
      return {
        title: task[titleField] || 'Untitled task',
        owner: task[ownerField] || '',
        rawDate,
        sortDate: normalizeDate(rawDate),
      };
    })
    .filter((item) => !item.sortDate || isSameDay(item.sortDate, today) || item.sortDate < endOfDay(today))
    .sort((a, b) => (a.sortDate?.getTime() || Number.MAX_SAFE_INTEGER) - (b.sortDate?.getTime() || Number.MAX_SAFE_INTEGER))
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      meta: [item.owner, item.sortDate ? formatDate(item.sortDate) : null].filter(Boolean).join(' · '),
    }));
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
  const topSignal = activeSignals()[0];
  if (topSignal) return { title: topSignal.title, meta: topSignal.description || 'Gentle attention item' };
  return normalizeTodayItems()[0] || null;
}

function buildTomorrowItems() {
  const snapshot = getSnapshotPayload(appState.config.calendarTomorrowSnapshotType);
  const tasks = appState.tasks
    .map((task) => ({
      title: task[appState.config.taskTitleField] || 'Untitled task',
      owner: task[appState.config.taskOwnerField] || '',
      date: normalizeDate(task[appState.config.taskDateField]),
    }))
    .filter((task) => task.date && isTomorrow(task.date))
    .slice(0, 3)
    .map((task) => ({
      title: task.title,
      meta: [task.owner, formatDate(task.date)].filter(Boolean).join(' · '),
    }));

  const events = Array.isArray(snapshot?.items)
    ? snapshot.items.slice(0, 3).map((item) => ({ title: item.title, meta: item.time ? `Event · ${item.time}` : 'Event' }))
    : [];

  return [...events, ...tasks].slice(0, 5);
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

  console.info(`Household Command Center ${APP_VERSION} booting`);
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

function toggleDevConsole() {
  devConsoleEl.classList.toggle('hidden');
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
  };
}

function setupButtons() {
  settingsButton.addEventListener('click', () => settingsDialog.showModal());
  refreshButton.addEventListener('click', refreshAll);
  devConsoleButton.addEventListener('click', toggleDevConsole);
  closeConsoleButton.addEventListener('click', hideDevConsole);
  clearConsoleButton.addEventListener('click', clearDevConsole);
  copyDiagnosticsButton.addEventListener('click', copyDiagnostics);
  saveSettingsButton.addEventListener('click', async (event) => {
    event.preventDefault();
    appState.config = readSettingsUi();
    saveConfig(appState.config);
    settingsDialog.close();
    clearSubscriptions();
    await ensureSupabase();
    await upsertDeviceProfile();
    await refreshAll();
    bindRealtime();
  });
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
}

function describeDateContext() {
  const weather = getSnapshotPayload(appState.config.weatherSnapshotType);
  return weather?.summary || new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function getSnapshotPayload(type) {
  return appState.snapshots[type]?.payload || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }
}

setInterval(() => {
  if (appState.supabase) refreshAll();
}, DEFAULT_CONFIG.uiRefreshSeconds * 1000);
