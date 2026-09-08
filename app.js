// ** นำ Web App URL จาก Google Apps Script มาวางตรงนี้ **
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6s3VgeIzUvomHjpEsCkqqOMBO7amr4x3sDF_QFVDRtKIAvGN3Y1CXJGe7WCXVEZQ43w/exec";

let logsData = [];
let chartInstance = null;
let selectedDateStr = new Date().toISOString().split('T')[0];

// Dynamic Calendar View State
let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth(); // 0 - 11

const thaiMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// Titles Map for Pages
const pageTitles = {
  home: { title: "หน้าหลัก สถิติสุขภาพ 👋", sub: "ภาพรวมการเผาผลาญแคลอรีสัปดาห์นี้" },
  record: { title: "บันทึกกิจกรรม 🏋️‍♂️", sub: "คำนวณและเก็บข้อมูลการออกกำลังกาย" },
  calendar: { title: "ปฏิทินย้อนหลัง 📅", sub: "เลือกดูรายการออกกำลังกายในแต่ละวัน" },
  history: { title: "ประวัติการบันทึก 📋", sub: "รายการประวัติย้อนหลังทั้งหมด" }
};

// MET Activity Values
const MET_BASE = {
  walking: 3.5,
  running: 9.0,
  cycling: 7.5,
  swimming: 6.0,
  badminton: 5.5
};

const activityDisplayNames = {
  running: "🏃‍♂️ การวิ่ง",
  walking: "🚶‍♂️ การเดิน",
  cycling: "🚴‍♂️ การปั่นจักรยาน",
  swimming: "🏊‍♂️ การว่ายน้ำ",
  badminton: "🏸 การตีแบต"
};

// Page Switcher Function
function switchPage(pageKey) {
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  document.getElementById(`page-${pageKey}`).classList.add('active');

  const navIdx = ['home', 'record', 'calendar', 'history'].indexOf(pageKey);
  const sidebarItems = document.querySelectorAll('.nav-item');
  const bottomBtns = document.querySelectorAll('.nav-btn');

  if (sidebarItems[navIdx]) sidebarItems[navIdx].classList.add('active');
  if (bottomBtns[navIdx]) bottomBtns[navIdx].classList.add('active');

  document.getElementById('pageTitle').innerText = pageTitles[pageKey].title;
  document.getElementById('pageSubtitle').innerText = pageTitles[pageKey].sub;

  if (pageKey === 'home') renderChart();
  if (pageKey === 'calendar') renderCalendar();
  if (pageKey === 'history') renderHistory();
}

// Toggle Distance Input Group
document.getElementById('activityType').addEventListener('change', (e) => {
  const distGroup = document.getElementById('distGroup');
  if (['swimming', 'badminton'].includes(e.target.value)) {
    distGroup.style.display = 'none';
  } else {
    distGroup.style.display = 'flex';
  }
});

// Calculate MET Calories
function calculateCalories(type, weightKg, durationMin, distanceKm) {
  let met = MET_BASE[type] || 4.0;

  if (distanceKm > 0 && durationMin > 0) {
    const speedKmH = distanceKm / (durationMin / 60);
    if (type === 'running') {
      if (speedKmH >= 11) met = 11.5;
      else if (speedKmH >= 8) met = 9.8;
      else met = 8.0;
    } else if (type === 'cycling') {
      if (speedKmH >= 20) met = 10.0;
      else if (speedKmH >= 15) met = 8.0;
    }
  }

  const calories = met * weightKg * (durationMin / 60);
  return Math.round(calories);
}

// Fetch logs from Google Apps Script
async function fetchLogs() {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL);
    logsData = await response.json();
    renderChart();
    renderHistory();
  } catch (e) {
    console.error("Error connecting to backend:", e);
  }
}

// Submit Workout Record
document.getElementById('workoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const type = document.getElementById('activityType').value;
  const duration = parseFloat(document.getElementById('duration').value);
  const weight = parseFloat(document.getElementById('weight').value);
  const distance = parseFloat(document.getElementById('distance').value) || 0;

  const calories = calculateCalories(type, weight, duration, distance);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const timestampStr = `${dateStr} ${timeStr}`;

  const payload = {
    action: "add",
    timestamp: timestampStr,
    date: dateStr,
    activity: type,
    distance: distance,
    duration: duration,
    weight: weight,
    calories: calories
  };

  logsData.push({ ...payload, id: new Date().getTime().toString() });
  document.getElementById('workoutForm').reset();
  
  switchPage('home');

  await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  fetchLogs();
});

// Delete Record
async function deleteLog(id) {
  logsData = logsData.filter(i => i.id.toString() !== id.toString());
  renderHistory();
  renderChart();
  renderCalendar();

  await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ action: "delete", id: id })
  });

  fetchLogs();
}

// Render Weekly Chart (Sunday to Friday)
function renderChart() {
  const caloriesDays = [0, 0, 0, 0, 0, 0];
  const now = new Date();
  
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);

  let totalWeeklyCal = 0;
  let weeklyCount = 0;

  logsData.forEach(item => {
    const d = new Date(item.date);
    if (d >= startOfWeek) {
      const dayIdx = d.getDay();
      if (dayIdx >= 0 && dayIdx <= 5) {
        caloriesDays[dayIdx] += Number(item.calories);
        totalWeeklyCal += Number(item.calories);
        weeklyCount++;
      }
    }
  });

  document.getElementById('dashWeeklyTotal').innerHTML = `${totalWeeklyCal} <small>kcal</small>`;
  document.getElementById('dashTotalCount').innerHTML = `${weeklyCount} <small>ครั้ง</small>`;

  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'],
      datasets: [{
        label: 'แคลอรี',
        data: caloriesDays,
        backgroundColor: '#6c5ce7',
        borderRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// Change Calendar Month via Arrow Buttons
function changeMonth(direction) {
  currentCalMonth += direction;
  if (currentCalMonth > 11) {
    currentCalMonth = 0;
    currentCalYear++;
  } else if (currentCalMonth < 0) {
    currentCalMonth = 11;
    currentCalYear--;
  }
  renderCalendar();
}

// Render Calendar View & Details
function renderCalendar() {
  const calendarGrid = document.getElementById('calendarGrid');
  calendarGrid.innerHTML = '';

  document.getElementById('currentMonthLabel').innerText = `${thaiMonths[currentCalMonth]} ${currentCalYear + 543}`;

  const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
  const firstDayIdx = new Date(currentCalYear, currentCalMonth, 1).getDay();

  const heads = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  heads.forEach(h => calendarGrid.innerHTML += `<div class="cal-day-head">${h}</div>`);

  for (let i = 0; i < firstDayIdx; i++) {
    calendarGrid.innerHTML += `<div></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(currentCalMonth + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    const dStr = `${currentCalYear}-${monthStr}-${dayStr}`;

    const dayLogs = logsData.filter(l => l.date === dStr);
    const totalCal = dayLogs.reduce((sum, item) => sum + Number(item.calories), 0);

    const isSelected = dStr === selectedDateStr;
    const hasData = dayLogs.length > 0;

    calendarGrid.innerHTML += `
      <div class="cal-day ${hasData ? 'has-data' : ''} ${isSelected ? 'selected' : ''}" onclick="selectCalendarDate('${dStr}')">
        <span class="cal-number">${d}</span>
        ${hasData ? `<span class="cal-badge">${totalCal}</span>` : '<span></span>'}
      </div>
    `;
  }

  renderDayDetails(selectedDateStr);
}

// Click Date Handler
function selectCalendarDate(dateStr) {
  selectedDateStr = dateStr;
  renderCalendar();
}

// Render Day Details List below Calendar
function renderDayDetails(dateStr) {
  const container = document.getElementById('selectedDateDetails');
  const titleEl = document.getElementById('selectedDateTitle');
  const summaryEl = document.getElementById('selectedDateSummary');
  
  container.innerHTML = '';

  const [y, m, d] = dateStr.split('-');
  const formattedDate = `${d}/${m}/${Number(y) + 543}`;
  titleEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> กิจกรรมวันที่ ${formattedDate}`;

  const dayLogs = logsData.filter(item => item.date === dateStr);
  const totalCal = dayLogs.reduce((acc, curr) => acc + Number(curr.calories), 0);

  summaryEl.innerText = `${totalCal} kcal (${dayLogs.length} รอบ)`;

  if (dayLogs.length === 0) {
    container.innerHTML = `<div class="no-data-msg"><i class="fa-regular fa-folder-open"></i> ไม่มีบันทึกการออกกำลังกายในวันนี้</div>`;
    return;
  }

  dayLogs.forEach(item => {
    const timeOnly = item.timestamp.split(' ')[1] || item.timestamp;
    const distText = item.distance && item.distance !== '-' && Number(item.distance) > 0 ? ` | ${item.distance} กม.` : '';

    container.innerHTML += `
      <div class="detail-item-card">
        <div class="detail-item-left">
          <div class="act-name">${activityDisplayNames[item.activity] || item.activity}</div>
          <div class="act-time"><i class="fa-regular fa-clock"></i> บันทึกเมื่อ ${timeOnly} น. | ใช้เวลา ${item.duration} นาที${distText}</div>
        </div>
        <div class="detail-item-right">
          <div class="act-cal">+${item.calories} kcal</div>
        </div>
      </div>
    `;
  });
}

// Render All History
function renderHistory() {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';

  const sortedData = [...logsData].reverse();
  sortedData.forEach(item => {
    historyList.innerHTML += `
      <div class="history-card-item">
        <div>
          <div class="history-title">${activityDisplayNames[item.activity] || item.activity}</div>
          <div class="history-sub">${item.timestamp} | ${item.duration} นาที ${item.distance && item.distance !== '-' ? `| ${item.distance} กม.` : ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="history-calories">${item.calories} kcal</span>
          <button class="btn-delete-log" onclick="deleteLog('${item.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;
  });
}

// App Init
document.addEventListener('DOMContentLoaded', () => {
  fetchLogs();
});