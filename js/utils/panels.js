function normalizePanelValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function isInMotionPanel(value) {
  return normalizePanelValue(value) === 'inmotion';
}

function loadStatusRank(status) {
  const order = { ready: 0, drying: 1, washing: 2, done: 3 };
  return order[status] ?? 9;
}

window.HCC.utils = Object.assign(window.HCC.utils || {}, {
  normalizePanelValue,
  isInMotionPanel,
  loadStatusRank,
});
