// v2.4.12
const APP_VERSION = '2.4.12';

// Action state model
const ACTION_STATE = {
  IDLE: 'idle',
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  ROLLED_BACK: 'rolled_back'
};

// Simple degraded check (hook into existing system state)
function isDegraded() {
  return window.__SYSTEM_STATE__?.degraded === true;
}

// Unified feedback
function showActionFeedback({type, message}) {
  console.log(`[${type}] ${message}`);
}

// Action wrapper
async function runAction({actionName, fn, onRollback}) {
  if (isDegraded()) {
    showActionFeedback({type:'blocked', message:'System degraded — try again'});
    if (onRollback) onRollback();
    return;
  }

  showActionFeedback({type:'pending', message:`${actionName}…`});

  try {
    await fn();
    showActionFeedback({type:'success', message:`${actionName} complete`});
  } catch (e) {
    console.error(e);
    showActionFeedback({type:'error', message:`${actionName} failed`});
    if (onRollback) onRollback();
  }
}

// Example: complete task
async function completeTask(task) {
  const original = {...task};

  // optimistic UI
  task.completed_at = new Date().toISOString();
  task.panel = 'done';

  await runAction({
    actionName: 'Completing task',
    fn: async () => {
      // simulate backend write
      return Promise.resolve();
    },
    onRollback: () => {
      Object.assign(task, original);
    }
  });
}
