function updateTime() {
  const now = new Date();
  document.getElementById('clock').innerText =
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('date').innerText =
    now.toDateString();
}

setInterval(updateTime, 1000);

function logAction(action) {
  console.log('Action:', action);
}

function init() {
  updateTime();
  document.getElementById('today-list').innerHTML = "<div>Task 1</div><div>Task 2</div>";
  document.getElementById('attention-list').innerHTML = "<div>Bins due</div>";
  document.getElementById('reminder-list').innerHTML = "<div>Buy milk</div>";
}

document.addEventListener('DOMContentLoaded', init);
