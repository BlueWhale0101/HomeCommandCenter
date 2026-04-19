const SURFACE_DEFINITIONS = {
  kitchen: {
    bodyClasses: ['widget-surface', 'kitchen-surface'],
    screenClass: 'screen kitchen-screen',
    widgets: [
      'kitchenHeader',
      'kitchenBestNext',
      'kitchenEvents',
      'kitchenTodayTasks',
      'kitchenSignals',
      'kitchenUpcoming',
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
    widgets: ['laundrySummary', 'laundryLoads'],
  },
  bedroom: {
    bodyClasses: ['widget-surface', 'bedroom-surface'],
    screenClass: 'screen single-column bedroom-layout widget-layout widget-layout-bedroom',
    widgets: ['bedroomHeader', 'bedroomBestNext', 'bedroomNextEvent', 'bedroomSignal'],
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

  const ambientFooter = (mode !== 'mobile' && mode !== 'bedroom') ? buildAmbientFooter() : null;

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

  if (mode === 'kitchen' && HCC?.surfaces?.kitchen?.renderSurface) {
    const node = HCC.surfaces.kitchen.renderSurface(context);
    if (node) screenEl.append(node);
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
  kitchenBestNext: (context) => buildKitchenBestNextCard(context),
  kitchenEvents: (context) => buildKitchenEventsCard(context),
  kitchenTodayTasks: (context) => buildKitchenTodayTasksCard(context),
  kitchenSignals: (context) => buildKitchenSignalsCard(context),
  kitchenUpcoming: (context) => buildKitchenUpcomingCard(context),
  today: (context) => buildCard('Today', '', renderTaskList(context.digest.todayTasks, 'No tasks visible.', { showPills: true }), 'panel-card panel-today-card'),
  spotlight: (context) => buildCard('Best Next Move', 'Most useful thing to do next', renderSpotlightCard(context.digest.spotlightTasks || (context.digest.spotlightTask ? [context.digest.spotlightTask] : []))),
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
  bedroomHeader: () => buildBedroomHeaderStrip(),
  bedroomBestNext: (context) => buildBedroomBestNextCard(context),
  bedroomNextEvent: (context) => buildBedroomNextEventCard(context),
  bedroomSignal: (context) => buildBedroomSignalCard(context),
  recentLogs: () => buildCard('Recent Logs', '', renderList(appState.logs.map(logToItem), 'No quick logs yet.')),
};



function buildKitchenBestNextCard(context) {
  return HCC?.surfaces?.kitchen?.buildBestNextCard ? HCC.surfaces.kitchen.buildBestNextCard(context) : buildCard('Best Next', '', buildEmptyState('Not available yet.'));
}

function buildKitchenEventsCard(context) {
  return HCC?.surfaces?.kitchen?.buildEventsCard ? HCC.surfaces.kitchen.buildEventsCard(context) : buildCard('Events', '', buildEmptyState('Not available yet.'));
}

function buildKitchenTodayTasksCard(context) {
  return HCC?.surfaces?.kitchen?.buildTodayTasksCard ? HCC.surfaces.kitchen.buildTodayTasksCard(context) : buildCard('Today Tasks', '', buildEmptyState('Not available yet.'));
}

function buildKitchenSignalsCard(context) {
  return HCC?.surfaces?.kitchen?.buildSignalsCard ? HCC.surfaces.kitchen.buildSignalsCard(context) : buildCard('Signals', '', buildEmptyState('Not available yet.'));
}

function buildKitchenUpcomingCard(context) {
  return HCC?.surfaces?.kitchen?.buildUpcomingCard ? HCC.surfaces.kitchen.buildUpcomingCard(context) : buildCard('Coming Up', '', buildEmptyState('Not available yet.'));
}

function buildBedroomHeaderStrip() {
  return HCC?.surfaces?.bedroom?.buildHeaderStrip ? HCC.surfaces.bedroom.buildHeaderStrip() : document.createElement('section');
}

function makeBedroomInteractiveCard(card, item, kind) {
  return HCC?.surfaces?.bedroom?.makeInteractiveCard ? HCC.surfaces.bedroom.makeInteractiveCard(card, item, kind) : card;
}

function buildBedroomBestNextCard(context) {
  return HCC?.surfaces?.bedroom?.buildBestNextCard ? HCC.surfaces.bedroom.buildBestNextCard(context) : buildCard('Best Next', '', buildEmptyState('Not available yet.'));
}

function selectBedroomNextEvent(context) {
  return HCC?.surfaces?.bedroom?.selectNextEvent ? HCC.surfaces.bedroom.selectNextEvent(context) : null;
}

function buildBedroomNextEventCard(context) {
  return HCC?.surfaces?.bedroom?.buildNextEventCard ? HCC.surfaces.bedroom.buildNextEventCard(context) : buildCard('Next Event', '', buildEmptyState('Not available yet.'));
}

function buildBedroomSignalCard(context) {
  return HCC?.surfaces?.bedroom?.buildSignalCard ? HCC.surfaces.bedroom.buildSignalCard(context) : buildCard('Signal', '', buildEmptyState('Not available yet.'));
}
