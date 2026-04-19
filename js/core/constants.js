const APP_VERSION = '3.4.5';
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
  calendarTimezone: 'Australia/Darwin',
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
  'calendarTimezone',
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

window.HCC.constants = Object.assign(window.HCC.constants || {}, {
  APP_VERSION,
  BOOT_TIMEOUT_MS,
  DEFAULT_CONFIG,
  DEVICE_KEY_STORAGE,
  CONFIG_STORAGE,
  SETTINGS_JSON_AUTOLOAD_DONE,
  TEST_TIME_STORAGE,
  SIGNAL_SNOOZE_STORAGE,
  DERIVED_SIGNAL_MEMORY_STORAGE,
  CALENDAR_ACCOUNTS_STORAGE,
  GOOGLE_AUTH_REDIRECT_STATE_STORAGE,
  SHARED_CONFIG_TABLE,
  SHARED_CONFIG_KEYS,
  DEVICE_PROFILE_CONFIG_KEYS,
  LOCAL_ONLY_CONFIG_KEYS,
  TASK_FIELD_CANDIDATES,
  QUICK_LOGS,
  LOAD_STATUS_ORDER,
  DAY_OPTIONS,
  DEFAULT_SIGNAL_RULES,
  CUSTOM_SIGNAL_SCHEDULE_OPTIONS,
  CUSTOM_SIGNAL_CLEAR_OPTIONS,
  TASK_COMPLETE_ARM_WINDOW_MS,
  HEALTHY_AUTO_REFRESH_SECONDS,
  DEGRADED_AUTO_REFRESH_SECONDS,
  SLOW_STATE_BACKSTOP_SECONDS,
  CALENDAR_PUBLISH_INTERVAL_SECONDS,
  HOUSEKEEPING_INTERVAL_SECONDS,
  SNAPSHOT_RETENTION_DAYS,
  LOG_RETENTION_DAYS,
  RESOLVED_SIGNAL_RETENTION_DAYS,
  LOAD_RETENTION_DAYS,
  RECENT_DONE_WINDOW_DAYS,
  HOUSEKEEPING_LAST_RUN_STORAGE,
  HOUSEKEEPING_REPORT_STORAGE,
  DEFAULT_CONNECTION_STATUS,
});
