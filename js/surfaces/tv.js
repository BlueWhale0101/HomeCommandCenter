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
    ? mapSnapshotItemsToDisplay(todaySnapshot.items.slice(0, 3))
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
    ? mapSnapshotItemsToDisplay(todaySnapshot.items.slice(0, 3))
    : [];
  const taskItems = context.digest.todayTasks.slice(0, 4);
  const overdueItems = context.digest.overdueTasks.slice(0, 1);
  return blendTaskAndEventItems(taskItems, eventItems, overdueItems, 6);
}
