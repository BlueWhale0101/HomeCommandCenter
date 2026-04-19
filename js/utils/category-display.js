
window.HCC = window.HCC || {};
window.HCC.display = window.HCC.display || {};

HCC.display.getCategoryKey = function getCategoryKey(item = {}) {
  return String(item.effectiveCategory || item.categoryKey || item.category || 'general').trim() || 'general';
};

HCC.display.getCategoryLabel = function getCategoryLabel(item = {}) {
  const key = HCC.display.getCategoryKey(item);
  return HCC?.tasks?.getCategoryLabel ? HCC.tasks.getCategoryLabel(key) : 'General';
};

HCC.display.getCategoryPillClass = function getCategoryPillClass(item = {}, extraClass = '') {
  const key = HCC.display.getCategoryKey(item);
  return ['category-pill', key, extraClass].filter(Boolean).join(' ').trim();
};

HCC.display.getCategoryRowClass = function getCategoryRowClass(prefix = 'task-category', item = {}, extraClass = '') {
  const key = HCC.display.getCategoryKey(item);
  return [`${prefix}-${key}`, extraClass].filter(Boolean).join(' ').trim();
};

HCC.display.buildCategoryDebugMeta = function buildCategoryDebugMeta(item) {
  const debug = item?.categoryDebug;
  if (!debug) return '';
  const confidence = Number.isFinite(debug.confidence) ? `${Math.round(debug.confidence * 100)}%` : '';
  const candidates = Array.isArray(debug.candidateKeys) && debug.candidateKeys.length
    ? `candidates ${debug.candidateKeys.join(', ')}`
    : '';
  const inferred = debug.manualOverride && debug.inferredCategory
    ? `inferred ${HCC?.tasks?.getCategoryLabel ? HCC.tasks.getCategoryLabel(debug.inferredCategory) : debug.inferredCategory}`
    : '';
  const override = debug.manualOverride ? 'manual override' : '';
  return [override, debug.matchedRule, debug.matchedText ? `match ${debug.matchedText}` : '', confidence, candidates, inferred].filter(Boolean).join(' · ');
};
