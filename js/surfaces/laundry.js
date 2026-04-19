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



function loadNextStep(status) {
  if (status === 'washing') return 'Next: move to dryer';
  if (status === 'drying') return 'Next: mark ready for folding';
  if (status === 'ready') return 'Next: mark done';
  return 'Done';
}

function renderLaundrySummary() {
  const wrapper = document.createElement('div');
  wrapper.className = 'laundry-summary laundry-summary-redesign';

  const activeLoads = [...appState.loads]
    .filter((load) => !load.archived_at && load.status !== 'done')
    .sort((a, b) => {
      const byStatus = loadStatusRank(a.status) - loadStatusRank(b.status);
      if (byStatus !== 0) return byStatus;
      return new Date(a.last_transition_at || a.updated_at || a.created_at) - new Date(b.last_transition_at || b.updated_at || b.created_at);
    });

  const headline = document.createElement('div');
  headline.className = 'laundry-headline';
  headline.textContent = activeLoads.length
    ? `${activeLoads.length} active load${activeLoads.length === 1 ? '' : 's'}`
    : 'No active loads';
  wrapper.append(headline);

  const addButton = document.createElement('button');
  addButton.className = 'primary-button laundry-start-button laundry-start-button-large';
  addButton.textContent = 'Start New Load';
  addButton.addEventListener('click', () => createLoad(addButton));
  wrapper.append(addButton);

  if (!activeLoads.length) {
    const empty = document.createElement('div');
    empty.className = 'laundry-empty-large muted';
    empty.textContent = 'Nothing running right now.';
    wrapper.append(empty);
    return wrapper;
  }

  const grid = document.createElement('div');
  grid.className = 'laundry-summary-grid laundry-summary-grid-large';
  const counts = { washing: 0, drying: 0, ready: 0 };
  for (const load of activeLoads) {
    if (counts[load.status] !== undefined) counts[load.status] += 1;
  }
  const items = [
    ['Washing', counts.washing, 'washing'],
    ['Drying', counts.drying, 'drying'],
    ['Ready', counts.ready, 'ready'],
  ];
  for (const [label, value, status] of items) {
    const chip = document.createElement('div');
    chip.className = `laundry-stat laundry-stat-large status-${status}`;
    chip.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    grid.append(chip);
  }
  wrapper.append(grid);

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
  wrapper.className = 'list laundry-load-list';

  const loads = [...appState.loads]
    .filter((load) => !load.archived_at && load.status !== 'done')
    .sort((a, b) => {
      const byStatus = loadStatusRank(a.status) - loadStatusRank(b.status);
      if (byStatus !== 0) return byStatus;
      return new Date(a.last_transition_at || a.updated_at || a.created_at) - new Date(b.last_transition_at || b.updated_at || b.created_at);
    });

  if (!loads.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state laundry-empty-large';
    empty.textContent = 'No loads in progress.';
    wrapper.append(empty);
    return wrapper;
  }

  for (const load of loads) {
    const row = document.createElement('button');
    row.className = `load-row load-button laundry-load-row-large status-${load.status}`;
    const actionLabel = load.status === 'washing'
      ? 'Tap to move to dryer'
      : load.status === 'drying'
      ? 'Tap to mark ready'
      : 'Tap to mark done';
    row.innerHTML = `
      <div class="load-row-main laundry-load-main-large">
        <div class="list-item-title laundry-load-title-large">${escapeHtml(load.label || `Load ${load.id.slice(0, 4)}`)}</div>
        <div class="laundry-load-status-line">
          <span class="pill laundry-load-pill status-${load.status}">${escapeHtml(capitalize(load.status))}</span>
          <span class="laundry-load-cta-large">${escapeHtml(actionLabel)}</span>
        </div>
        <div class="list-item-meta laundry-load-meta-large">Last moved ${relativeTime(load.last_transition_at || load.updated_at || load.created_at)}</div>
      </div>
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
    wrapper.append(buildEmptyState('No active loads to move right now.'));
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
