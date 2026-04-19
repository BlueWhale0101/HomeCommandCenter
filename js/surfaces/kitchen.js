
window.HCC = window.HCC || {};
window.HCC.surfaces = window.HCC.surfaces || {};
window.HCC.surfaces.kitchen = window.HCC.surfaces.kitchen || {};

(function () {
  function buildTopStrip(context) {
    const strip = document.createElement('section');
    strip.className = 'kitchen-top-strip panel-card';

    const left = document.createElement('div');
    left.className = 'kitchen-top-strip-main';
    const title = document.createElement('div');
    title.className = 'kitchen-top-strip-title';
    title.textContent = buildKitchenHeadline(context.digest);
    const meta = document.createElement('div');
    meta.className = 'kitchen-top-strip-meta';
    const now = getNowDate();
    meta.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    left.append(title, meta);

    const right = document.createElement('div');
    right.className = 'kitchen-top-strip-side';

    const weather = getSnapshotPayload(appState.config.weatherSnapshotType) || null;
    const weatherBox = document.createElement('div');
    weatherBox.className = 'kitchen-top-chip';
    const weatherLabel = document.createElement('div');
    weatherLabel.className = 'kitchen-top-chip-label';
    weatherLabel.textContent = 'Weather';
    const weatherValue = document.createElement('div');
    weatherValue.className = 'kitchen-top-chip-value';
    weatherValue.textContent = weather?.summary || weather?.locationName || '—';
    weatherBox.append(weatherLabel, weatherValue);

    const nextEvent = (context.digest.allEventItems || [])[0] || null;
    const eventBox = document.createElement('div');
    eventBox.className = 'kitchen-top-chip';
    const eventLabel = document.createElement('div');
    eventLabel.className = 'kitchen-top-chip-label';
    eventLabel.textContent = 'Next Event';
    const eventValue = document.createElement('div');
    eventValue.className = 'kitchen-top-chip-value';
    eventValue.textContent = nextEvent ? [nextEvent.title, nextEvent.meta].filter(Boolean).join(' · ') : 'No events queued';
    eventBox.append(eventLabel, eventValue);

    right.append(weatherBox, eventBox);
    strip.append(left, right);
    return strip;
  }

  function buildQuickActions(context) {
    const wrap = document.createElement('section');
    wrap.className = 'kitchen-quick-strip panel-card';

    const row = document.createElement('div');
    row.className = 'kitchen-quick-strip-row';

    row.append(
      buildSecondaryButton(`All Tasks (${context.digest.counts.all || 0})`, () => openQuickView('All Tasks', context.digest.allItems, 'No active tasks right now.')),
      buildSecondaryButton(`All Events (${(context.digest.allEventItems || []).length})`, () => openQuickView('All Events', context.digest.allEventItems, 'No calendar items loaded yet.')),
      buildSecondaryButton('Refresh', () => refreshAll('kitchen quick refresh')),
      buildSecondaryButton('Settings', () => openSettingsDialog())
    );

    wrap.append(row);
    return wrap;
  }

  HCC.surfaces.kitchen.renderSurface = function renderKitchenSurface(context) {
    const root = document.createElement('div');
    root.className = 'kitchen-command-surface';

    const top = buildTopStrip(context);

    const columns = document.createElement('div');
    columns.className = 'kitchen-command-columns';

    const left = document.createElement('div');
    left.className = 'kitchen-command-column kitchen-command-column-left';
    const right = document.createElement('div');
    right.className = 'kitchen-command-column kitchen-command-column-right';

    left.append(
      HCC.surfaces.kitchen.buildBestNextCard(context),
      buildQuickActions(context),
      HCC.surfaces.kitchen.buildTodayTasksCard(context)
    );

    right.append(
      HCC.surfaces.kitchen.buildEventsCard(context),
      HCC.surfaces.kitchen.buildSignalsCard(context),
      HCC.surfaces.kitchen.buildUpcomingCard(context)
    );

    columns.append(left, right);
    root.append(top, columns);
    return root;
  };

  HCC.surfaces.kitchen.buildSummaryCard = function buildSummaryCard(context) {
    return buildTopStrip(context);
  };

  HCC.surfaces.kitchen.buildBestNextCard = function buildBestNextCard(context) {
    const spotlightItems = context.digest.spotlightTasks || (context.digest.spotlightTask ? [context.digest.spotlightTask] : []);
    return buildCard('Best Next', 'Do this next', renderSpotlightCard(spotlightItems), 'kitchen-bestnext-card panel-card panel-focus-card');
  };

  HCC.surfaces.kitchen.buildEventsCard = function buildEventsCard(context) {
    const items = (context.digest.allEventItems || []).slice(0, 5);
    return buildCard('Events', `${context.digest.counts.eventsToday || 0} today`, renderTaskList(items, 'No calendar items loaded yet.', { showPills: true }), 'kitchen-events-card panel-card');
  };

  HCC.surfaces.kitchen.buildTodayTasksCard = function buildTodayTasksCard(context) {
    const items = (context.digest.todayTasks || []).slice(0, 6);
    return buildCard('Today Tasks', `${context.digest.counts.today || 0} on deck`, renderTaskList(items, 'Nothing due today right now.', { showPills: true }), 'kitchen-tasks-card panel-card panel-today-card');
  };

  HCC.surfaces.kitchen.buildSignalsCard = function buildSignalsCard(context) {
    const count = (context.signals || []).length;
    return buildCard('Needs Attention', count ? `${count} visible · tap to arm · swipe for detail` : 'Everything looks calm right now.', renderSignalActionList((context.signals || []).slice(0, 6), 'Everything looks calm right now.'), 'kitchen-signals-card panel-card panel-signals-card');
  };

  HCC.surfaces.kitchen.buildUpcomingCard = function buildUpcomingCard(context) {
    return buildCard('Coming Up', `${context.digest.upcomingTasks.length || 0} queued`, renderTaskList((context.digest.upcomingTasks || []).slice(0, 8), 'Nothing is queued up soon.', { showPills: true }), 'kitchen-upcoming-card panel-card panel-upcoming-card');
  };
})();
