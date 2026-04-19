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

window.HCC.utils = Object.assign(window.HCC.utils || {}, {
  getGoogleRedirectUri,
  createGoogleAuthState,
  saveGoogleAuthRedirectState,
  consumeGoogleAuthRedirectState,
  normalizeSignalRules,
  getEffectiveSignalRules,
  persistSignalRulesDraft,
  setSignalRulesDraft,
  formatHourLabel,
  createRuleId,
  normalizeCustomSignalRule,
  summarizeCustomSignalRule,
});
