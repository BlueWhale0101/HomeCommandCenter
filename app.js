// Home Command Center - v2.4.12 FULL FILE
const APP_VERSION = '2.4.12';

// ===== SYSTEM STATE =====
window.__SYSTEM_STATE__ = window.__SYSTEM_STATE__ || {
  degraded: false
};

// ===== ACTION STATE MODEL =====
const ACTION_STATE = {
  IDLE: 'idle',
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  ROLLED_BACK: 'rolled_back'
};

// ===== UTIL =====
function isDegraded() {
  return window.__SYSTEM_STATE__.degraded === true;
}

// ===== TOAST / FEEDBACK =====
function showActionFeedback({ type, message }) {
  const el = document.getElementById('toast');
  if (!el) return console.log(message);

  el.innerText = message;
  el.className = 'toast ' + type;
  el.style.opacity = 1;

  setTimeout(() => {
    el.style.opacity = 0;
  }, 2000);
}

// ===== ACTION WRAPPER =====
async function runAction({ actionName, fn, onRollback }) {
  if (isDegraded()) {
    showActionFeedback({
      type: 'blocked',
      message: 'System degraded — try again'
    });
    if (onRollback) onRollback();
    return;
  }

  showActionFeedback({
    type: 'pending',
    message: actionName + '…'
  });

  try {
    await fn();

    showActionFeedback({
      type: 'success',
      message: actionName + ' complete'
    });

  } catch (e) {
    console.error(e);

    showActionFeedback({
      type: 'error',
      message: actionName + ' failed — restored'
    });

    if (onRollback) onRollback();
  }
}

// ===== TASK LOGIC =====
async function completeTask(task) {
  const original = { ...task };

  // optimistic update
  task.completed_at = new Date().toISOString();
  task.panel = 'done';

  render();

  await runAction({
    actionName: 'Completing task',
    fn: async () => {
      // TODO: replace with Supabase update
      return Promise.resolve();
    },
    onRollback: () => {
      Object.assign(task, original);
      render();
    }
  });
}

// ===== DEMO STATE =====
let tasks = [
  { id: 1, title: 'Test Task', panel: 'todo' }
];

// ===== RENDER =====
function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  tasks.forEach(t => {
    const div = document.createElement('div');
    div.className = 'task';
    div.innerText = t.title + (t.panel === 'done' ? ' ✓' : '');
    div.onclick = () => completeTask(t);
    app.appendChild(div);
  });
}

// ===== INIT =====
render();
