/* ============================================================
   Google Classroom Extractor — App Logic
   ============================================================ */


/* ------------------------------------------------------------
   State
   ------------------------------------------------------------ */
let tokenClient;        // Google OAuth token client
let accessToken;        // Short-lived access token (expires ~1hr)
let courses    = [];    // All courses fetched from Classroom API
let selectedId = null;  // Currently selected course ID
let courseData = {};    // Cached assignments/materials per course ID
let activeTab  = 'ACTIVE';
let showOwnedOnly = true; // default: show only courses you teach


/* ------------------------------------------------------------
   UI Utilities
   ------------------------------------------------------------ */

function setStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status ' + type;
}


/* ------------------------------------------------------------
   Auth — Google OAuth
   ------------------------------------------------------------ */

function connectGoogle() {
  const clientId = (typeof CONFIG !== 'undefined' && CONFIG.clientId) ? CONFIG.clientId : '';
  if (!clientId) {
    setStatus('auth-status', 'Client ID not found. Please check your config.js or environment variable.', 'error');
    return;
  }
  if (!window.google || !window.google.accounts) {
    setStatus('auth-status', 'Google Identity Services not ready. Please refresh and try again.', 'error');
    return;
  }

  setStatus('auth-status', 'Opening Google sign-in…', 'info');
  document.getElementById('connect-btn').disabled = true;

  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
        'https://www.googleapis.com/auth/classroom.topics.readonly',
        'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
        'https://www.googleapis.com/auth/classroom.rosters.readonly'
      ].join(' '),
      callback: handleToken,
      error_callback: (err) => {
        setStatus('auth-status', 'Auth error: ' + (err.message || err.type), 'error');
        document.getElementById('connect-btn').disabled = false;
      }
    });
    tokenClient.requestAccessToken({ prompt: 'consent', include_granted_scopes: true });
  } catch(e) {
    setStatus('auth-status', 'Error: ' + e.message, 'error');
    document.getElementById('connect-btn').disabled = false;
  }
}

async function handleToken(resp) {
  if (resp.error) {
    setStatus('auth-status', 'Auth error: ' + resp.error, 'error');
    document.getElementById('connect-btn').disabled = false;
    return;
  }
  accessToken = resp.access_token;
  setStatus('auth-status', 'Signed in! Fetching courses…', 'info');
  await fetchCourses();
}

function resetApp() {
  if (accessToken && window.google) google.accounts.oauth2.revoke(accessToken);
  accessToken = null;
  courses     = [];
  selectedId  = null;
  courseData  = {};
  document.getElementById('courses-section').style.display = 'none';
  document.getElementById('detail-section').style.display  = 'none';
  document.getElementById('setup-section').style.display   = 'block';
  document.getElementById('connect-btn').disabled          = false;
  document.getElementById('auth-status').style.display     = 'none';
}


/* ------------------------------------------------------------
   API — Classroom REST calls
   ------------------------------------------------------------ */

async function apiGet(url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e.error && e.error.message) || 'API error ' + r.status);
  }
  return r.json();
}

async function fetchCourses() {
  try {
    let all = [], pageToken = '';
    do {
      const url = 'https://classroom.googleapis.com/v1/courses?pageSize=50' +
                  (pageToken ? '&pageToken=' + pageToken : '');
      const data = await apiGet(url);
      all       = all.concat(data.courses || []);
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    courses = all;
    renderCourses();
  } catch(e) {
    setStatus('auth-status', 'Failed to fetch courses: ' + e.message, 'error');
    document.getElementById('connect-btn').disabled = false;
  }
}

async function fetchSelected() {
  if (!selectedId) return;
  const btn = document.getElementById('fetch-btn');
  btn.disabled    = true;
  btn.textContent = 'Fetching…';

  try {
    setStatus('fetch-status', 'Fetching assignments…', 'info');
    const awData = await apiGet(
      `https://classroom.googleapis.com/v1/courses/${selectedId}/courseWork?pageSize=100&orderBy=dueDate asc`
    ).catch(e => { throw new Error('Assignments: ' + e.message); });

    setStatus('fetch-status', 'Fetching materials…', 'info');
    const mwData = await apiGet(
      `https://classroom.googleapis.com/v1/courses/${selectedId}/courseWorkMaterials?pageSize=100`
    ).catch(e => { throw new Error('Materials: ' + e.message); });

    setStatus('fetch-status', 'Fetching topics…', 'info');
    const tpData = await apiGet(
      `https://classroom.googleapis.com/v1/courses/${selectedId}/topics?pageSize=100`
    ).catch(() => ({ topic: [] }));

    const topicMap = {};
    (tpData.topic || []).forEach(t => { topicMap[t.topicId] = t.name; });

    const assignments = (awData.courseWork || []).slice().sort((a, b) => toTimestamp(a) - toTimestamp(b));
    const materials   = (mwData.courseWorkMaterial || []).slice().sort((a, b) => toTimestamp(a) - toTimestamp(b));

    courseData[selectedId] = { assignments, materials, topicMap };
    setStatus('fetch-status', 'Done!', 'success');
    showDetail(selectedId);
  } catch(e) {
    setStatus('fetch-status', 'Error: ' + e.message, 'error');
  }

  btn.disabled    = false;
  btn.textContent = 'Fetch assignments & materials';
}


/* ------------------------------------------------------------
   Drag and Drop — Course Card Reordering
   ------------------------------------------------------------ */

function getStorageKey(tabKey) {
  return 'course-order-' + tabKey;
}

function getSavedOrder(tabKey) {
  const saved = localStorage.getItem(getStorageKey(tabKey));
  return saved ? JSON.parse(saved) : null;
}

function saveOrder(tabKey, ids) {
  localStorage.setItem(getStorageKey(tabKey), JSON.stringify(ids));
}

function applyOrder(courses, tabKey) {
  const saved = getSavedOrder(tabKey);
  if (!saved) return courses;
  return [...courses].sort((a, b) => {
    const ai = saved.indexOf(a.id);
    const bi = saved.indexOf(b.id);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function enableDragAndDrop(grid, tabKey) {
  let dragSrc = null;

  grid.querySelectorAll('.course-card').forEach(card => {
    card.draggable = true;

    card.addEventListener('dragstart', (e) => {
      dragSrc = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.course-card').forEach(c => c.classList.remove('drag-over'));
      const ids = [...grid.querySelectorAll('.course-card')].map(c => c.dataset.id);
      saveOrder(tabKey, ids);
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      grid.querySelectorAll('.course-card').forEach(c => c.classList.remove('drag-over'));
      if (card !== dragSrc) card.classList.add('drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrc && dragSrc !== card) {
        const cards = [...grid.querySelectorAll('.course-card')];
        const srcIdx = cards.indexOf(dragSrc);
        const tgtIdx = cards.indexOf(card);
        if (srcIdx < tgtIdx) {
          grid.insertBefore(dragSrc, card.nextSibling);
        } else {
          grid.insertBefore(dragSrc, card);
        }
      }
      card.classList.remove('drag-over');
    });
  });
}


/* ------------------------------------------------------------
   Course Card Colors — localStorage persistence
   ------------------------------------------------------------ */

const COURSE_COLORS = [
  { label: 'None',            value: null      },
  { label: 'Blue (dark)',     value: '#1A56DB' },
  { label: 'Blue (light)',    value: '#93C5FD' },
  { label: 'Purple (dark)',   value: '#7E22CE' },
  { label: 'Purple (light)',  value: '#D8B4FE' },
  { label: 'Green (dark)',    value: '#166534' },
  { label: 'Green (light)',   value: '#86EFAC' },
  { label: 'Orange (dark)',   value: '#C2410C' },
  { label: 'Orange (light)',  value: '#FDB37A' },
  { label: 'Red (dark)',      value: '#B91C1C' },
  { label: 'Red (light)',     value: '#FCA5A5' },
  { label: 'Yellow (dark)',   value: '#B45309' },
  { label: 'Yellow (light)',  value: '#FDE68A' },
  { label: 'Teal (dark)',     value: '#0E7490' },
  { label: 'Teal (light)',    value: '#67E8F9' },
  { label: 'Graphite (dark)', value: '#374151' },
  { label: 'Graphite (light)',value: '#9CA3AF' },
];

function getCourseColor(courseId) {
  return localStorage.getItem('course-color-' + courseId) || null;
}

function setCourseColor(courseId, color) {
  if (color) {
    localStorage.setItem('course-color-' + courseId, color);
  } else {
    localStorage.removeItem('course-color-' + courseId);
  }
}

function getTextColor(hex) {
  if (!hex) return '';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? '#333333' : '#ffffff';
}

function applyCardColor(div, color) {
  if (color) {
    div.style.background  = color;
    div.style.color       = getTextColor(color);
  } else {
    div.style.background  = '#2E2E2E';
    div.style.color       = '#FFFFFF';
  }
  div.style.border = '1px solid #FFFFFF';
}

let openPalette = null;

function togglePalette(e, courseId, div) {
  e.stopPropagation();

  if (openPalette) {
    openPalette.remove();
    openPalette = null;
    return;
  }

  const palette = document.createElement('div');
  palette.className = 'color-palette';

  COURSE_COLORS.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (c.value === null ? ' none' : '');
    if (c.value) swatch.style.background = c.value;
    if (getCourseColor(courseId) === c.value) swatch.classList.add('selected');
    swatch.title = c.label;
    swatch.onclick = (e) => {
      e.stopPropagation();
      setCourseColor(courseId, c.value);
      applyCardColor(div, c.value);
      const btn = div.querySelector('.color-picker-btn');
      btn.style.background  = c.value || '#2E2E2E';
      btn.style.borderColor = c.value ? getTextColor(c.value) : '#ddd';
      palette.remove();
      openPalette = null;
    };
    palette.appendChild(swatch);
  });

  div.appendChild(palette);
  openPalette = palette;

  setTimeout(() => {
    document.addEventListener('click', () => {
      palette.remove();
      openPalette = null;
    }, { once: true });
  }, 0);
}


/* ------------------------------------------------------------
   Courses UI — Tabs & Cards
   ------------------------------------------------------------ */

function toggleOwned() {
  showOwnedOnly = !showOwnedOnly;
  document.getElementById('owned-toggle').textContent =
    showOwnedOnly ? 'Showing: My courses' : 'Showing: All courses';
  renderCourses();
}

function renderCourses() {
  document.getElementById('setup-section').style.display   = 'none';
  document.getElementById('courses-section').style.display = 'block';

  const filtered = showOwnedOnly ? courses.filter(c => c.teacherFolder) : courses;

  const groups = { ACTIVE: [], ARCHIVED: [], DECLINED: [], OTHER: [] };
  filtered.forEach(c => {
    const s = c.courseState || 'OTHER';
    (groups[s] || groups.OTHER).push(c);
  });

  const tabDefs = [
    { key: 'ACTIVE',   label: 'Active'   },
    { key: 'ARCHIVED', label: 'Archived' },
    { key: 'DECLINED', label: 'Declined' },
    { key: 'OTHER',    label: 'Other'    }
  ].filter(t => groups[t.key].length > 0);

  if (!tabDefs.find(t => t.key === activeTab) && tabDefs.length) {
    activeTab = tabDefs[0].key;
  }

  const tabsEl   = document.getElementById('course-tabs');
  const panelsEl = document.getElementById('course-tab-panels');
  tabsEl.innerHTML   = '';
  panelsEl.innerHTML = '';

  tabDefs.forEach(t => {
    const btn = document.createElement('button');
    btn.className   = 'tab' + (t.key === activeTab ? ' active' : '');
    btn.dataset.key = t.key;
    btn.innerHTML   = `${t.label} <span class="tab-badge">${groups[t.key].length}</span>`;
    btn.onclick     = () => switchTab(t.key);
    tabsEl.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (t.key === activeTab ? ' active' : '');
    panel.id        = 'tab-panel-' + t.key;

    const grid = document.createElement('div');
    grid.className  = 'course-grid';

    const orderedCourses = applyOrder(groups[t.key], t.key);
    orderedCourses.forEach(c => {
      const div       = document.createElement('div');
      div.className   = 'course-card' + (c.id === selectedId ? ' selected' : '');
      div.dataset.id  = c.id;
      div.onclick     = () => selectCourse(c.id);

      const savedColor = getCourseColor(c.id);
      applyCardColor(div, savedColor);
      if (c.id === selectedId) div.style.border = '3px solid #FFFFFF';

      div.innerHTML = `
        <h3>${esc(c.name)}</h3>
        <div class="meta">${esc(c.section || '')}${c.room ? ' · ' + esc(c.room) : ''}</div>`;

      const colorBtn = document.createElement('div');
      colorBtn.className = 'color-picker-btn';
      colorBtn.style.background  = savedColor || '#2E2E2E';
      colorBtn.style.borderColor = savedColor ? getTextColor(savedColor) : '#ddd';
      colorBtn.title = 'Pick a color';
      colorBtn.onclick = (e) => togglePalette(e, c.id, div);
      div.appendChild(colorBtn);

      grid.appendChild(div);
    });

    panel.appendChild(grid);
    enableDragAndDrop(grid, t.key);
    panelsEl.appendChild(panel);
  });
}

function switchTab(key) {
  activeTab = key;
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('active', el.dataset.key === key);
  });
  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.toggle('active', el.id === 'tab-panel-' + key);
  });
}

function selectCourse(id) {
  selectedId = id;
  document.querySelectorAll('.course-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
    el.style.border = el.dataset.id === id ? '3px solid #FFFFFF' : '1px solid #FFFFFF';
  });
  document.getElementById('fetch-btn').disabled   = false;
  document.getElementById('monitor-btn').disabled = false;
}


/* ------------------------------------------------------------
   Detail Panel — Assignments & Materials
   ------------------------------------------------------------ */

function showDetail(courseId) {
  const course = courses.find(c => c.id === courseId);
  const { assignments, materials, topicMap } = courseData[courseId];

  document.getElementById('detail-title').textContent = course.name;
  const body = document.getElementById('detail-body');
  body.innerHTML = '';
  document.getElementById('detail-actions').style.display = 'flex';

  const merged = mergeByTopic(assignments, materials, topicMap);

  if (merged.length) {
    merged.forEach(g => {
      const block = document.createElement('div');
      block.className = 'topic-block';
      block.innerHTML = `<div class="topic-label">${esc(g.topicName)}</div>`;

      if (g.assignments.length) {
        const subLabel = document.createElement('div');
        subLabel.className = 'section-heading';
        subLabel.textContent = 'Assignments';
        block.appendChild(subLabel);
        const ul = document.createElement('ul');
        ul.className = 'item-list';
        g.assignments.forEach(a => {
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="item-title">${esc(a.title)}</div>
            <div class="item-meta">
              ${a.dueDate ? 'Due: ' + fmtDate(a.dueDate) : 'No due date'}
              ${a.maxPoints ? ' · ' + a.maxPoints + ' pts' : ''}
            </div>
            ${a.description ? '<div class="item-desc">' + esc(a.description.slice(0, 120)) + (a.description.length > 120 ? '…' : '') + '</div>' : ''}
            ${renderAttachments(a.materials)}`;
          ul.appendChild(li);
        });
        block.appendChild(ul);
      }

      if (g.materials.length) {
        const subLabel = document.createElement('div');
        subLabel.className = 'section-heading';
        subLabel.textContent = 'Materials';
        block.appendChild(subLabel);
        const ul = document.createElement('ul');
        ul.className = 'item-list';
        g.materials.forEach(m => {
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="item-title">${esc(m.title)}</div>
            ${m.description ? '<div class="item-desc">' + esc(m.description.slice(0, 120)) + (m.description.length > 120 ? '…' : '') + '</div>' : ''}
            ${renderAttachments(m.materials)}`;
          ul.appendChild(li);
        });
        block.appendChild(ul);
      }

      body.appendChild(block);
    });
  } else {
    body.innerHTML = `<div class="empty-note">No assignments or materials found.</div>`;
  }

  document.getElementById('detail-section').style.display = 'block';
  document.getElementById('detail-section').scrollIntoView({ behavior: 'smooth' });
}

function closeDetail() {
  document.getElementById('detail-section').style.display  = 'none';
  document.getElementById('detail-actions').style.display  = 'flex';
}


/* ------------------------------------------------------------
   Student Progress Monitor
   ------------------------------------------------------------ */

async function monitorSelected() {
  if (!selectedId) return;
  const btn = document.getElementById('monitor-btn');
  btn.disabled    = true;
  btn.textContent = 'Loading…';
  setStatus('fetch-status', 'Fetching roster…', 'info');

  try {
    let students = [], studentPageToken = '';
    do {
      const url = `https://classroom.googleapis.com/v1/courses/${selectedId}/students?pageSize=100` +
                  (studentPageToken ? '&pageToken=' + studentPageToken : '');
      const data = await apiGet(url);
      students = students.concat(data.students || []);
      studentPageToken = data.nextPageToken || '';
    } while (studentPageToken);

    const cwData = await apiGet(`https://classroom.googleapis.com/v1/courses/${selectedId}/courseWork?pageSize=100`);
    const coursework = (cwData.courseWork || []).filter(cw => cw.maxPoints > 0);

    setStatus('fetch-status', 'Fetching submissions…', 'info');
    const submissionResults = await Promise.all(
      coursework.map(cw =>
        apiGet(`https://classroom.googleapis.com/v1/courses/${selectedId}/courseWork/${cw.id}/studentSubmissions?pageSize=200`)
          .then(d => ({ cwId: cw.id, maxPoints: cw.maxPoints, dueDate: cw.dueDate, submissions: d.studentSubmissions || [] }))
          .catch(() => ({ cwId: cw.id, maxPoints: cw.maxPoints, dueDate: cw.dueDate, submissions: [] }))
      )
    );

    const studentMap = {};
    students.forEach(s => {
      studentMap[s.userId] = {
        name:     s.profile.name.fullName,
        userId:   s.userId,
        earned:   0,
        possible: 0,
        missing:  0
      };
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    submissionResults.forEach(({ maxPoints, dueDate, submissions }) => {
      let isPastDue = true;
      if (dueDate) {
        const due = new Date(dueDate.year, (dueDate.month || 1) - 1, dueDate.day || 1);
        isPastDue = due <= today;
      }

      const submittedStudents = new Set(submissions.map(s => s.userId));

      submissions.forEach(sub => {
        const st = studentMap[sub.userId];
        if (!st) return;
        if (sub.assignedGrade != null) {
          st.possible += maxPoints;
          st.earned   += sub.assignedGrade;
        } else if (isPastDue) {
          const isSubmitted = sub.state === 'TURNED_IN' || sub.state === 'RETURNED';
          if (!isSubmitted) st.missing += 1;
        }
      });

      if (isPastDue) {
        Object.keys(studentMap).forEach(userId => {
          if (!submittedStudents.has(userId)) {
            studentMap[userId].missing += 1;
          }
        });
      }
    });

    setStatus('fetch-status', 'Done!', 'success');
    showProgressReport(studentMap, selectedId);

  } catch(e) {
    setStatus('fetch-status', 'Error: ' + e.message, 'error');
  }

  btn.disabled    = false;
  btn.textContent = 'Monitor student progress';
}

function showProgressReport(studentMap, courseId) {
  const course = courses.find(c => c.id === courseId);

  const rows = Object.values(studentMap).sort((a, b) => {
    const pctA = a.possible > 0 ? a.earned / a.possible : 1;
    const pctB = b.possible > 0 ? b.earned / b.possible : 1;
    return pctA - pctB;
  });

  let html = `
    <div class="progress-header">
      <h2>${esc(course.name)} — Student Progress</h2>
      <div class="progress-legend">
        <span class="legend-dot dot-red"></span> At risk (≤60%)
        <span class="legend-dot dot-yellow"></span> Watch (61–75%)
        <span class="legend-dot dot-green"></span> On track (&gt;75%)
      </div>
    </div>
    <table class="progress-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Grade</th>
          <th>Earned / Possible</th>
          <th>Missing</th>
        </tr>
      </thead>
      <tbody>`;

  rows.forEach(s => {
    const pct      = s.possible > 0 ? (s.earned / s.possible) * 100 : null;
    const pctLabel = pct !== null ? pct.toFixed(2) + '%' : 'N/A';
    const rowClass = pct === null ? '' : pct <= 60 ? 'row-red' : pct <= 75 ? 'row-yellow' : 'row-green';
    html += `
      <tr class="${rowClass}">
        <td>${esc(s.name)}</td>
        <td class="grade-cell">${pctLabel}</td>
        <td>${s.earned} / ${s.possible}</td>
        <td>${s.missing > 0 ? s.missing + ' missing' : '—'}</td>
      </tr>`;
  });

  html += `</tbody></table>`;

  document.getElementById('detail-title').textContent     = '';
  document.getElementById('detail-body').innerHTML        = html;
  document.getElementById('detail-section').style.display = 'block';
  document.getElementById('detail-actions').style.display = 'none';
  document.getElementById('detail-section').scrollIntoView({ behavior: 'smooth' });
}


/* ------------------------------------------------------------
   Print View
   ------------------------------------------------------------ */

function openPrintView(mode) {
  const course = courses.find(c => c.id === selectedId);
  if (!course) return;
  const data = courseData[selectedId];
  if (!data) return;
  const html = buildPrintHtml(course, data, mode);
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

function buildPrintHtml(course, data, mode) {
  const merged    = mergeByTopic(data.assignments, data.materials, data.topicMap);
  const isSummary = mode === 'summary';
  let body = '';

  merged.forEach(g => {
    body += `<div class="topic-block"><h3>${escHtml(g.topicName)}</h3>`;

    if (g.assignments.length) {
      body += `<div class="sub-label">Assignments</div><ul>`;
      g.assignments.forEach(a => {
        if (isSummary) {
          body += `<li>
            <div class="item-title">${escHtml(a.title)}${a.maxPoints ? ' <span class="pts">' + a.maxPoints + ' pts</span>' : ''}</div>
          </li>`;
        } else {
          body += `<li>
            <div class="item-title">${escHtml(a.title)}${a.maxPoints ? ' <span class="pts">' + a.maxPoints + ' pts</span>' : ''}</div>
            ${a.description ? `<div class="item-desc">${escHtml(a.description)}</div>` : ''}
            ${printAttachments(a.materials)}
          </li>`;
        }
      });
      body += `</ul>`;
    }

    if (g.materials.length) {
      body += `<div class="sub-label">Materials</div><ul>`;
      g.materials.forEach(m => {
        if (isSummary) {
          body += `<li><div class="item-title">${escHtml(m.title)}</div></li>`;
        } else {
          body += `<li>
            <div class="item-title">${escHtml(m.title)}</div>
            ${m.description ? `<div class="item-desc">${escHtml(m.description)}</div>` : ''}
            ${printAttachments(m.materials)}
          </li>`;
        }
      });
      body += `</ul>`;
    }

    body += `</div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(course.name)} — ${isSummary ? 'Summary' : 'Detailed'} Outline</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, serif; color: #111; max-width: 780px; margin: 0 auto; padding: 2rem; }
  .no-print { margin-bottom: 1.5rem; }
  @media print { .no-print { display: none; } }
  button { padding: 8px 20px; font-size: 14px; background: #F26522; color: #fff; border: none; border-radius: 6px; cursor: pointer; margin-right: 8px; }
  button.secondary { background: #fff; color: #333; border: 1px solid #ccc; }
  .course-header { border-bottom: 2px solid #111; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .mode-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #F26522; margin-bottom: 6px; display: block; }
  .course-header h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .course-meta { font-size: 13px; color: #555; }
  .topic-block { margin-bottom: ${isSummary ? '1rem' : '1.5rem'}; page-break-inside: avoid; }
  .topic-block h3 { font-size: 14px; font-weight: 700; color: #F26522; margin-bottom: 4px; }
  .sub-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin: 6px 0 3px; }
  ul { list-style: none; padding-left: 0; }
  li { padding: ${isSummary ? '4px 0 4px 12px' : '8px 0 8px 12px'}; border-left: 3px solid #e0e0e0; margin-bottom: ${isSummary ? '3px' : '6px'}; page-break-inside: avoid; }
  .item-title { font-size: ${isSummary ? '13px' : '14px'}; font-weight: 600; }
  .pts { font-size: 12px; font-weight: 400; color: #888; margin-left: 6px; }
  .item-desc { font-size: 13px; color: #444; margin-top: 3px; line-height: 1.5; white-space: pre-wrap; }
  .item-attachments { margin-top: 5px; font-size: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
  .item-attachments a { color: #F26522; text-decoration: none; }
  .footer { margin-top: 3rem; font-size: 11px; color: #aaa; border-top: 0.5px solid #eee; padding-top: 8px; }
  @media print {
    body { padding: 1rem; }
    .topic-block h3 { color: #000; }
    .item-attachments a { color: #000; }
    li { border-left-color: #999; }
  }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <div class="course-header">
    <span class="mode-label">${isSummary ? 'Summary Outline' : 'Detailed Outline'}</span>
    <h1>${escHtml(course.name)}</h1>
    <div class="course-meta">
      ${course.section ? escHtml(course.section) : ''}${course.room ? ' &nbsp;·&nbsp; Room ' + escHtml(course.room) : ''}
      ${course.description ? '<br><em>' + escHtml(course.description) + '</em>' : ''}
    </div>
  </div>
  ${body}
  <div class="footer">Generated ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</body>
</html>`;
}


/* ------------------------------------------------------------
   Markdown Export
   ------------------------------------------------------------ */

function downloadSelectedMd() {
  const c = courses.find(x => x.id === selectedId);
  if (!c) return;
  download(slugify(c.name) + '.md', courseToMd(c, courseData[selectedId]));
}

async function downloadAllMd() {
  const s = document.createElement('script');
  s.src   = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  document.head.appendChild(s);
  await new Promise(r => s.onload = r);
  const zip = new JSZip();
  courses.forEach(c => zip.file(slugify(c.name) + '.md', courseToMd(c, courseData[c.id])));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'classroom-courses.zip';
  a.click();
  URL.revokeObjectURL(url);
}

function courseToMd(c, data) {
  const lines = [];
  lines.push('# ' + (c.name || 'Untitled Course'));
  lines.push('');
  lines.push('## Course info');
  lines.push('');
  if (c.section)        lines.push('- **Section:** ' + c.section);
  if (c.room)           lines.push('- **Room:** ' + c.room);
  if (c.courseState)    lines.push('- **State:** ' + c.courseState);
  if (c.creationTime)   lines.push('- **Created:** ' + c.creationTime.split('T')[0]);
  if (c.updateTime)     lines.push('- **Updated:** ' + c.updateTime.split('T')[0]);
  if (c.enrollmentCode) lines.push('- **Enrollment code:** ' + c.enrollmentCode);
  if (c.alternateLink)  lines.push('- **Classroom link:** ' + c.alternateLink);
  if (c.description)    { lines.push(''); lines.push('> ' + c.description.replace(/\n/g, '  \n> ')); }
  lines.push('');

  if (data) {
    const merged = mergeByTopic(data.assignments, data.materials, data.topicMap || {});
    merged.forEach(g => {
      lines.push('## ' + g.topicName);
      lines.push('');
      if (g.assignments.length) {
        lines.push('### Assignments');
        lines.push('');
        g.assignments.forEach(a => {
          lines.push('#### ' + (a.title || 'Untitled'));
          if (a.dueDate)       lines.push('- **Due:** ' + fmtDate(a.dueDate));
          if (a.maxPoints)     lines.push('- **Points:** ' + a.maxPoints);
          if (a.description)   lines.push('- **Description:** ' + a.description.replace(/\n/g, ' '));
          if (a.alternateLink) lines.push('- **Classroom link:** ' + a.alternateLink);
          const att = attachmentsToMd(a.materials);
          if (att.length) { lines.push('- **Attachments:**'); att.forEach(l => lines.push(l)); }
          lines.push('');
        });
      }
      if (g.materials.length) {
        lines.push('### Materials');
        lines.push('');
        g.materials.forEach(m => {
          lines.push('#### ' + (m.title || 'Untitled'));
          if (m.description)   lines.push('- **Description:** ' + m.description.replace(/\n/g, ' '));
          if (m.alternateLink) lines.push('- **Classroom link:** ' + m.alternateLink);
          const att = attachmentsToMd(m.materials);
          if (att.length) { lines.push('- **Attachments:**'); att.forEach(l => lines.push(l)); }
          lines.push('');
        });
      }
    });
  }

  return lines.join('\n');
}


/* ------------------------------------------------------------
   Helpers — Grouping, Sorting, Formatting
   ------------------------------------------------------------ */

function mergeByTopic(assignments, materials, topicMap) {
  const groups = {};

  assignments.forEach(a => {
    const tid = a.topicId || '__none__';
    if (!groups[tid]) groups[tid] = { assignments: [], materials: [] };
    groups[tid].assignments.push(a);
  });

  materials.forEach(m => {
    const tid = m.topicId || '__none__';
    if (!groups[tid]) groups[tid] = { assignments: [], materials: [] };
    groups[tid].materials.push(m);
  });

  return Object.keys(groups)
    .map(tid => ({
      topicId:     tid,
      topicName:   tid === '__none__' ? 'No topic' : (topicMap[tid] || 'Unknown topic'),
      assignments: groups[tid].assignments,
      materials:   groups[tid].materials
    }))
    .sort((a, b) => {
      if (a.topicId === '__none__') return 1;
      if (b.topicId === '__none__') return -1;
      const aIsWeek = /^week\d+/i.test(a.topicName);
      const bIsWeek = /^week\d+/i.test(b.topicName);
      if (!aIsWeek && bIsWeek) return -1;
      if (aIsWeek && !bIsWeek) return 1;
      return a.topicName.localeCompare(b.topicName, undefined, { numeric: true, sensitivity: 'base' });
    });
}

function groupByTopic(items, topicMap) {
  const groups = {};
  items.forEach(item => {
    const tid = item.topicId || '__none__';
    if (!groups[tid]) groups[tid] = [];
    groups[tid].push(item);
  });
  return Object.keys(groups)
    .map(tid => ({
      topicId:   tid,
      topicName: tid === '__none__' ? 'No topic' : (topicMap[tid] || 'Unknown topic'),
      items:     groups[tid]
    }))
    .sort((a, b) => {
      if (a.topicId === '__none__') return 1;
      if (b.topicId === '__none__') return -1;
      const aIsWeek = /^week\d+/i.test(a.topicName);
      const bIsWeek = /^week\d+/i.test(b.topicName);
      if (!aIsWeek && bIsWeek) return -1;
      if (aIsWeek && !bIsWeek) return 1;
      return a.topicName.localeCompare(b.topicName, undefined, { numeric: true, sensitivity: 'base' });
    });
}

function toTimestamp(item) {
  if (item.dueDate) {
    const d = item.dueDate;
    return new Date(d.year, (d.month || 1) - 1, d.day || 1).getTime();
  }
  if (item.scheduledTime) return new Date(item.scheduledTime).getTime();
  if (item.creationTime)  return new Date(item.creationTime).getTime();
  return 0;
}

function fmtDate(d) {
  if (!d) return '';
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function download(filename, text) {
  const a    = document.createElement('a');
  a.href     = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text);
  a.download = filename;
  a.click();
}

function slugify(s) {
  return String(s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}


/* ------------------------------------------------------------
   Helpers — Attachments
   ------------------------------------------------------------ */

function renderAttachments(materials) {
  if (!materials || !materials.length) return '';
  const items = materials.map(mat => {
    if (mat.driveFile)    { const f = mat.driveFile.driveFile; return `<a href="${f.alternateLink}" target="_blank">📄 ${esc(f.title || 'Drive file')}</a>`; }
    if (mat.youtubeVideo) { const v = mat.youtubeVideo;        return `<a href="${v.alternateLink}" target="_blank">🎬 ${esc(v.title || 'YouTube video')}</a>`; }
    if (mat.link)         { const l = mat.link;                return `<a href="${l.url}" target="_blank">🔗 ${esc(l.title || l.url)}</a>`; }
    if (mat.form)         { const f = mat.form;                return `<a href="${f.formUrl}" target="_blank">📝 ${esc(f.title || 'Form')}</a>`; }
    return '';
  }).filter(Boolean);
  return items.length ? `<div class="item-attachments">${items.join(' &nbsp; ')}</div>` : '';
}

function printAttachments(materials) {
  if (!materials || !materials.length) return '';
  const items = materials.map(mat => {
    if (mat.driveFile)    { const f = mat.driveFile.driveFile; return `<a href="${f.alternateLink}">📄 ${escHtml(f.title || 'Drive file')}</a>`; }
    if (mat.youtubeVideo) { const v = mat.youtubeVideo;        return `<a href="${v.alternateLink}">🎬 ${escHtml(v.title || 'YouTube video')}</a>`; }
    if (mat.link)         { const l = mat.link;                return `<a href="${l.url}">🔗 ${escHtml(l.title || l.url)}</a>`; }
    if (mat.form)         { const f = mat.form;                return `<a href="${f.formUrl}">📝 ${escHtml(f.title || 'Form')}</a>`; }
    return '';
  }).filter(Boolean);
  return items.length ? `<div class="item-attachments">${items.join('')}</div>` : '';
}

function attachmentsToMd(materials) {
  if (!materials || !materials.length) return [];
  return materials.map(mat => {
    if (mat.driveFile)    { const f = mat.driveFile.driveFile; return `  - 📄 [${f.title || 'Drive file'}](${f.alternateLink})`; }
    if (mat.youtubeVideo) { const v = mat.youtubeVideo;        return `  - 🎬 [${v.title || 'YouTube video'}](${v.alternateLink})`; }
    if (mat.link)         { const l = mat.link;                return `  - 🔗 [${l.title || l.url}](${l.url})`; }
    if (mat.form)         { const f = mat.form;                return `  - 📝 [${f.title || 'Form'}](${f.formUrl})`; }
    return null;
  }).filter(Boolean);
}