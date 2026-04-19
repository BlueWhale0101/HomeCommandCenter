
window.HCC = window.HCC || {};
window.HCC.display = window.HCC.display || {};

HCC.display.normalizeCalendarItem = function normalizeCalendarItem(item = {}) {
  const base = {
    ...item,
    title: item.title || item.summary || '(Untitled event)',
    sourceLabel: item.sourceLabel || item.calendarSummary || item.calendar?.summary || 'Calendar',
    description: item.description || '',
    location: item.location || '',
    calendarSummary: item.calendarSummary || item.calendar?.summary || '',
    kind: 'Calendar',
  };
  const enriched = HCC?.tasks?.applyCategoryMetadata ? HCC.tasks.applyCategoryMetadata(base) : { ...base, category: 'general', categoryDebug: null };
  return {
    ...enriched,
    effectiveCategory: String(enriched.category || 'general').trim() || 'general',
  };
};

HCC.display.toCalendarDisplayItem = function toCalendarDisplayItem(rawItem = {}, options = {}) {
  const index = Number(options.index || 0);
  const labelPrefix = String(options.labelPrefix || '');
  const item = HCC.display.normalizeCalendarItem(rawItem);
  const stableId = item.id || item.eventId || item.uid || `${item.title || 'calendar'}-${item.time || index}`;
  return {
    id: stableId,
    itemKey: `calendar:${stableId}`,
    title: item.title,
    meta: [item.sourceLabel || 'Calendar', labelPrefix && item.time ? `${labelPrefix} · ${item.time}` : labelPrefix || item.time].filter(Boolean).join(' · '),
    pill: HCC.display.getCategoryLabel(item),
    pillClass: HCC.display.getCategoryPillClass(item, 'calendar-pill'),
    category: item.effectiveCategory,
    categoryKey: item.effectiveCategory,
    effectiveCategory: item.effectiveCategory,
    rowClass: ['calendar-list-item', HCC.display.getCategoryRowClass('calendar-category', item)].filter(Boolean).join(' '),
    categoryDebug: item.categoryDebug || null,
    actionHint: HCC.display.buildCategoryDebugMeta(item),
    kind: 'Calendar',
    sourceLabel: item.sourceLabel || 'Calendar',
    time: item.time || '',
    location: item.location || '',
    description: item.description || '',
    calendarSummary: item.calendarSummary || '',
    raw: item.raw || rawItem,
  };
};

HCC.display.mapSnapshotItemsToDisplay = function mapSnapshotItemsToDisplay(items = [], labelPrefix = '') {
  return items.map((rawItem, index) => HCC.display.toCalendarDisplayItem(rawItem, { labelPrefix, index }));
};

HCC.display.toTaskDisplayItem = function toTaskDisplayItem(task = {}, fallbackPill = 'Task') {
  if (task.signal_type || task.severity) return signalToItem(task);
  const effectiveCategory = HCC.display.getCategoryKey(task);
  const manualOverride = !!task?.categoryDebug?.manualOverride;
  const dueMeta = task.dueDate ? formatTaskTiming(task.dueDate) : (task.dueText || 'No due date');
  const owner = task.owner || '';
  const canComplete = !!task.id && !pendingTaskCompletions.has(task.id);
  const armed = canComplete && isTaskCompletionArmed(task.id);
  return {
    id: task.id,
    itemKey: `task:${task.id || task.title}`,
    title: task.title,
    meta: [owner, armed ? 'Ready to complete' : dueMeta, manualOverride ? 'Manual category' : ''].filter(Boolean).join(' · '),
    pill: armed ? 'Ready' : HCC.display.getCategoryLabel({ effectiveCategory }),
    pillClass: ['category-pill', effectiveCategory, manualOverride ? 'override-pill' : '', armed ? 'warning' : (task.dueDate && task.dueDate < startOfDay(getNowDate()) ? 'danger' : '')].filter(Boolean).join(' ').trim(),
    ownerKey: normalizeOwnerKey(owner),
    category: effectiveCategory,
    categoryKey: effectiveCategory,
    effectiveCategory,
    categoryDebug: task.categoryDebug || null,
    manualOverride,
    emphasis: armed ? 'armed' : (task.dueDate && task.dueDate < startOfDay(getNowDate()) ? 'high' : task.dueDate && isSameDay(task.dueDate, getNowDate()) ? 'medium' : 'normal'),
    rowClass: `${taskRowClass(task, armed)} ${HCC.display.getCategoryRowClass('task-category', { effectiveCategory })}`.trim(),
    actionHint: canComplete ? (armed ? 'Tap again to complete · Swipe to edit' : 'Tap once to arm completion · Swipe to edit') : 'Swipe to edit',
    onActivate: canComplete ? () => completeTask(task.raw || task) : null,
    onSwipe: () => HCC?.ui?.openTaskEditModal?.(task.raw || task),
    raw: task.raw || task,
  };
};

HCC.display.toDisplayTaskItems = function toDisplayTaskItems(tasks = [], fallbackPill = 'Task') {
  return tasks.map((task) => HCC.display.toTaskDisplayItem(task, fallbackPill));
};
