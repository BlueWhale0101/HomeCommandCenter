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
  const nextRaw = Array.isArray(todayCal?.payload?.items) ? todayCal.payload.items[0] : null;
  const next = nextRaw ? normalizeDisplayCalendarItem(nextRaw) : null;
  if (next) {
    items.push({
      title: next.title,
      meta: [snapshotMetaLabel('Next event', todayCal), next.time, next.sourceLabel].filter(Boolean).join(' · '),
      pill: HCC?.tasks?.getCategoryLabel ? HCC.tasks.getCategoryLabel(next.category) : snapshotFreshnessPill(todayCal, 'Calendar'),
      pillClass: `category-pill ${next.category || 'general'} calendar-pill`,
      categoryKey: next.category || 'general',
      rowClass: `calendar-list-item calendar-category-${next.category || 'general'}`,
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
