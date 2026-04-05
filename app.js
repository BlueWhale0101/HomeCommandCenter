// v0.7.0-dev
const DEFAULT_MODE = 'tv';

function detectActiveTasks(tasks, completedField = 'completed') {
  return (tasks || []).filter(t => {
    if (!t) return false;

    const isCompleted =
      t[completedField] === true ||
      t[completedField] === 'true' ||
      t[completedField] === 1;

    const isArchived =
      t.archived === true ||
      t.archived === 'true' ||
      t.status === 'archived';

    return !isCompleted && !isArchived;
  });
}

function buildTodayItems(tasksDueToday = [], eventsToday = [], overdueTasks = []) {
  return [
    ...tasksDueToday,
    ...eventsToday,
    ...overdueTasks.slice(0, 2)
  ].slice(0, 4);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('v0.7.0-dev boot');
});
