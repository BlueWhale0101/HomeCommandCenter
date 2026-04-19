
window.HCC = window.HCC || {};
window.HCC.surfaces = window.HCC.surfaces || {};
window.HCC.surfaces.bedroom = window.HCC.surfaces.bedroom || {};

HCC.surfaces.bedroom.buildHeaderStrip = function buildHeaderStrip() {
  const section = document.createElement('section');
  section.className = 'bedroom-header-strip';

  const left = document.createElement('div');
  left.className = 'bedroom-header-left';

  const date = document.createElement('div');
  date.className = 'bedroom-header-date';
  date.textContent = getNowDate().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const phase = document.createElement('div');
  phase.className = 'bedroom-header-phase';
  phase.textContent = isEvening() ? 'Tomorrow view' : 'Today view';
  left.append(date, phase);

  const right = document.createElement('div');
  right.className = 'bedroom-header-right';

  const timeEl = document.createElement('div');
  timeEl.className = 'bedroom-header-time';
  timeEl.textContent = getNowDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const health = getAmbientHealthState();
  const statusButton = document.createElement('button');
  statusButton.type = 'button';
  statusButton.className = `bedroom-status-pill bedroom-status-${health.level}`;
  statusButton.textContent = health.level === 'degraded' ? 'Needs attention' : health.level === 'aging' ? 'Slightly behind' : 'Healthy';
  statusButton.setAttribute('aria-label', 'System status');
  statusButton.title = 'Tap for trust details and version';
  statusButton.addEventListener('click', () => {
    if (HCC?.ui?.openBedroomStatusModal) HCC.ui.openBedroomStatusModal();
  });

  right.append(timeEl, statusButton);
  section.append(left, right);
  return section;
};

HCC.surfaces.bedroom.makeInteractiveCard = function makeInteractiveCard(card, item, kind) {
  if (!item) return card;
  card.classList.add('bedroom-interactive-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const open = () => {
    if (HCC?.ui?.openBedroomItemModal) HCC.ui.openBedroomItemModal(item, { kind });
  };
  card.addEventListener('click', (event) => {
    event.preventDefault();
    open();
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
  return card;
};

HCC.surfaces.bedroom.buildBestNextCard = function buildBestNextCard(context) {
  const primary = context?.digest?.spotlightTask || null;
  const body = primary
    ? renderSpotlightCard([primary])
    : buildEmptyState(`Nothing big for ${context?.isEvening ? 'tomorrow' : 'today'} yet.`);
  const subtitle = context?.isEvening ? 'Best thing to set up for tomorrow' : 'Best thing to do next';
  const card = buildCard('Best Next', subtitle, body, 'panel-card bedroom-best-next-card');
  if (primary?.categoryKey) card.classList.add('bedroom-category-shell', `spotlight-category-${primary.categoryKey}`);
  return HCC.surfaces.bedroom.makeInteractiveCard(card, primary, 'task');
};

HCC.surfaces.bedroom.selectNextEvent = function selectNextEvent(context) {
  const todayItems = context?.digest?.calendarTodayItems || [];
  const tomorrowItems = context?.digest?.calendarTomorrowItems || [];
  if (context?.isEvening && !todayItems.length) return tomorrowItems[0] || null;
  return todayItems[0] || tomorrowItems[0] || null;
};

HCC.surfaces.bedroom.buildNextEventCard = function buildNextEventCard(context) {
  const nextEvent = HCC.surfaces.bedroom.selectNextEvent(context);
  const subtitle = context?.isEvening ? 'Next thing on the calendar' : 'Coming up next';
  const body = nextEvent
    ? renderTaskList([{ ...nextEvent, actionHint: 'Open event details' }], 'No calendar items are loaded yet.', { showPills: true })
    : buildEmptyState('Nothing on the calendar yet.');
  const card = buildCard('Next Event', subtitle, body, 'panel-card bedroom-next-event-card');
  if (nextEvent?.categoryKey) card.classList.add('bedroom-category-shell', `spotlight-category-${nextEvent.categoryKey}`);
  return HCC.surfaces.bedroom.makeInteractiveCard(card, nextEvent, 'event');
};

HCC.surfaces.bedroom.buildSignalCard = function buildSignalCard(context) {
  const topSignal = Array.isArray(context?.signals) ? context.signals[0] : null;
  const signalItem = topSignal ? signalToItem(topSignal) : null;
  const body = signalItem
    ? renderTaskList([{ ...signalItem, actionHint: 'Open signal details' }], 'Nothing needs attention right now.', { showPills: true })
    : buildEmptyState('Nothing needs attention right now.');
  const card = buildCard('Signal', 'One thing to keep in mind', body, 'panel-card bedroom-signal-card');
  if (topSignal?.severity) card.classList.add(`bedroom-signal-severity-${topSignal.severity}`);
  return HCC.surfaces.bedroom.makeInteractiveCard(card, signalItem || topSignal, 'signal');
};
