function fieldExistsOnTask(fieldName, sample) {
  return !!fieldName && !!sample && Object.prototype.hasOwnProperty.call(sample, fieldName);
}

function taskIsCompleted(task) {
  if (!task) return false;

  const candidateValues = [];
  const configuredField = appState.config.taskCompletedField;
  if (configuredField && configuredField in task) {
    candidateValues.push(task[configuredField]);
  }

  ['completed', 'done', 'is_completed', 'is_done', 'complete', 'panel', 'completed_at'].forEach((field) => {
    if (field in task) candidateValues.push(task[field]);
  });

  for (const value of candidateValues) {
    if (appState.config.useStringCompleted && String(value) === String(appState.config.taskCompletedValue)) return true;
    if (typeof value === 'boolean' && value) return true;
    if (typeof value === 'string' && ['true', 'completed', 'done', 'yes', '1'].includes(value.toLowerCase())) return true;
    if (typeof value === 'number' && value === 1) return true;
  }

  if (typeof task.panel === 'string' && ['done', 'completed'].includes(task.panel.toLowerCase())) return true;
  if (task.completed_at) return true;
  if (typeof task.status === 'string' && ['done', 'completed'].includes(task.status.toLowerCase())) return true;
  return false;
}

function taskIsArchived(task) {
  if (!task) return false;
  if (task.archived === true || task.archived === 1) return true;
  if (typeof task.archived === 'string' && ['true', '1', 'yes'].includes(task.archived.toLowerCase())) return true;
  if (task.archived_at) return true;
  if (typeof task.panel === 'string' && task.panel.toLowerCase() === 'archived') return true;
  if (typeof task.status === 'string' && task.status.toLowerCase() === 'archived') return true;
  return false;
}



function detectTaskField(sample, configKey) {
  const configured = appState.config[configKey];
  if (fieldExistsOnTask(configured, sample)) return configured;
  const candidates = (window.HCC.constants && window.HCC.constants.TASK_FIELD_CANDIDATES && window.HCC.constants.TASK_FIELD_CANDIDATES[configKey]) || (typeof TASK_FIELD_CANDIDATES !== "undefined" ? TASK_FIELD_CANDIDATES[configKey] : []) || [];
  return candidates.find((candidate) => fieldExistsOnTask(candidate, sample)) || configured;
}

function maybeAutoMapTaskFields(tasks) {
  const sample = tasks?.[0];
  if (!sample) return;
  const updates = {};
  const candidates = (window.HCC.constants && window.HCC.constants.TASK_FIELD_CANDIDATES) || (typeof TASK_FIELD_CANDIDATES !== "undefined" ? TASK_FIELD_CANDIDATES : {});
  for (const key of Object.keys(candidates || {})) {
    const detected = detectTaskField(sample, key);
    if (detected && appState.config[key] !== detected) updates[key] = detected;
  }
  if (Object.keys(updates).length) {
    Object.assign(appState.config, updates);
    try { persistLocalConfig(); } catch {}
    try { fillSettingsForm(); } catch {}
    try { pushDevLog('info', `Auto-mapped task fields: ${Object.entries(updates).map(([k, v]) => `${k}→${v}`).join(', ')}`); } catch {}
  }
}

window.HCC.utils = Object.assign(window.HCC.utils || {}, {
  fieldExistsOnTask,
  detectTaskField,
  maybeAutoMapTaskFields,
  taskIsCompleted,
  taskIsArchived,
});
