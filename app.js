/* ============================================================
   GCDash — App Logic
   ============================================================ */

/* ------------------------------------------------------------
   State
   ------------------------------------------------------------ */
let tokenClient;
let accessToken;
let courses = [];
let selectedId = null;
let courseData = {};
let activeTab = 'ACTIVE';
let showOwnedOnly = true;
let combineMode = localStorage.getItem('gcdash-combine-enabled') === '1';
let combineIds = [];
try {
	combineIds = JSON.parse(localStorage.getItem('gcdash-combine-ids') || '[]');
} catch {
	combineIds = [];
}
let selectedTopicBlock = null;

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
	const clientId =
		typeof CONFIG !== 'undefined' && CONFIG.clientId ? CONFIG.clientId : '';
	if (!clientId) {
		setStatus('auth-status', 'Client ID not found.', 'error');
		return;
	}
	if (!window.google || !window.google.accounts) {
		setStatus('auth-status', 'Google Identity Services not ready.', 'error');
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
				'https://www.googleapis.com/auth/classroom.rosters.readonly',
				'https://www.googleapis.com/auth/classroom.profile.emails',
				'https://www.googleapis.com/auth/drive.file',
			].join(' '),
			callback: handleToken,
			error_callback: (err) => {
				setStatus(
					'auth-status',
					'Auth error: ' + (err.message || err.type),
					'error',
				);
				document.getElementById('connect-btn').disabled = false;
			},
		});
		tokenClient.requestAccessToken({
			prompt: 'select_account consent',
			include_granted_scopes: false,
		});
	} catch (e) {
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
	localStorage.setItem('gcdash-token-handoff', accessToken);
	setStatus('auth-status', 'Signed in! Fetching courses…', 'info');
	await fetchCourses();
}

function resetApp() {
	if (accessToken && window.google) google.accounts.oauth2.revoke(accessToken);
	accessToken = null;
	courses = [];
	selectedId = null;
	courseData = {};
	document.getElementById('courses-section').style.display = 'none';
	document.getElementById('detail-section').style.display = 'none';
	document.getElementById('quick-links-section').style.display = 'none';
	document.getElementById('setup-section').style.display = 'block';
	document.getElementById('connect-btn').disabled = false;
	document.getElementById('auth-status').style.display = 'none';
	document.getElementById('signout-btn').style.display = 'none';
	localStorage.removeItem('gcdash-token-handoff');
	localStorage.removeItem('gcdash-return-token');
}

/* ------------------------------------------------------------
   API — Classroom REST calls
   ------------------------------------------------------------ */

async function apiGet(url) {
	const r = await fetch(url, {
		headers: { Authorization: 'Bearer ' + accessToken },
	});
	if (!r.ok) {
		const e = await r.json().catch(() => ({}));
		throw new Error((e.error && e.error.message) || 'API error ' + r.status);
	}
	return r.json();
}

async function fetchCourses() {
	try {
		let all = [],
			pageToken = '';
		do {
			const url =
				'https://classroom.googleapis.com/v1/courses?pageSize=50' +
				(pageToken ? '&pageToken=' + pageToken : '');
			const data = await apiGet(url);
			all = all.concat(data.courses || []);
			pageToken = data.nextPageToken || '';
		} while (pageToken);
		courses = all;
		renderCourses();
		showQuickLinks();
		initSettings();
	} catch (e) {
		setStatus('auth-status', 'Failed to fetch courses: ' + e.message, 'error');
		document.getElementById('connect-btn').disabled = false;
	}
}

async function fetchCourseData(courseId) {
	const awData = await apiGet(
		`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?pageSize=100&orderBy=dueDate asc`,
	).catch((e) => {
		throw new Error('Assignments: ' + e.message);
	});
	const mwData = await apiGet(
		`https://classroom.googleapis.com/v1/courses/${courseId}/courseWorkMaterials?pageSize=100`,
	).catch((e) => {
		throw new Error('Materials: ' + e.message);
	});
	const tpData = await apiGet(
		`https://classroom.googleapis.com/v1/courses/${courseId}/topics?pageSize=100`,
	).catch(() => ({ topic: [] }));

	const topicMap = {};
	(tpData.topic || []).forEach((t) => {
		topicMap[t.topicId] = t.name;
	});
	const assignments = (awData.courseWork || [])
		.slice()
		.sort((a, b) => toTimestamp(a) - toTimestamp(b));
	const materials = (mwData.courseWorkMaterial || [])
		.slice()
		.sort((a, b) => toTimestamp(a) - toTimestamp(b));

	courseData[courseId] = { assignments, materials, topicMap };
}

async function fetchSelected() {
	if (combineMode) return fetchCombined();
	if (!selectedId) return;
	const btn = document.getElementById('fetch-btn');
	btn.disabled = true;
	btn.textContent = 'Fetching…';

	try {
		setStatus('fetch-status', 'Fetching assignments, materials & topics…', 'info');
		await fetchCourseData(selectedId);
		setStatus('fetch-status', 'Done!', 'success');
		showDetail(selectedId);
	} catch (e) {
		setStatus('fetch-status', 'Error: ' + e.message, 'error');
	}

	btn.disabled = false;
	btn.textContent = 'Fetch assignments & materials';
}

async function fetchCombined() {
	if (combineIds.length < 2) return;
	const btn = document.getElementById('fetch-btn');
	btn.disabled = true;
	btn.textContent = 'Fetching…';

	try {
		for (let i = 0; i < combineIds.length; i++) {
			const id = combineIds[i];
			const course = courses.find((c) => c.id === id);
			setStatus(
				'fetch-status',
				`Fetching ${course ? course.name : id}… (${i + 1}/${combineIds.length})`,
				'info',
			);
			await fetchCourseData(id);
		}
		setStatus('fetch-status', 'Done!', 'success');
		showCombinedDetail(combineIds);
	} catch (e) {
		setStatus('fetch-status', 'Error: ' + e.message, 'error');
	}

	updateFetchButtonState();
	btn.textContent = 'Fetch assignments & materials';
}

/* ------------------------------------------------------------
   Drive Sync
   ------------------------------------------------------------ */

const DRIVE_FOLDER_NAME = '.gcdash-config';
const DRIVE_FILE_NAME = 'settings.json';
let driveFolderId = null,
	driveFileId = null,
	syncTimeout = null;

async function initSettings() {
	try {
		await syncFromDrive();
	} catch (e) {
		console.log('Drive sync unavailable:', e.message);
	}
}

async function syncFromDrive() {
	if (!accessToken) return;
	driveFolderId = await findOrCreateFolder();
	const file = await findSettingsFile();
	if (file) {
		driveFileId = file.id;
		const s = await downloadSettings(file.id);
		if (s) mergeSettings(s);
	} else await saveSettingsToDrive();
}

async function findOrCreateFolder() {
	const q = encodeURIComponent(
		`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
	);
	const r = await fetch(
		`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
		{ headers: { Authorization: 'Bearer ' + accessToken } },
	);
	const d = await r.json();
	if (d.files && d.files.length > 0) return d.files[0].id;
	const c = await fetch('https://www.googleapis.com/drive/v3/files', {
		method: 'POST',
		headers: {
			Authorization: 'Bearer ' + accessToken,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			name: DRIVE_FOLDER_NAME,
			mimeType: 'application/vnd.google-apps.folder',
		}),
	});
	return (await c.json()).id;
}

async function findSettingsFile() {
	if (!driveFolderId) return null;
	const q = encodeURIComponent(
		`name='${DRIVE_FILE_NAME}' and '${driveFolderId}' in parents and trashed=false`,
	);
	const r = await fetch(
		`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
		{ headers: { Authorization: 'Bearer ' + accessToken } },
	);
	const d = await r.json();
	return d.files && d.files.length > 0 ? d.files[0] : null;
}

async function downloadSettings(fileId) {
	const r = await fetch(
		`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
		{ headers: { Authorization: 'Bearer ' + accessToken } },
	);
	try {
		return await r.json();
	} catch (e) {
		return null;
	}
}

function mergeSettings(settings) {
	if (settings.courseColors)
		Object.entries(settings.courseColors).forEach(([id, color]) =>
			localStorage.setItem('course-color-' + id, color),
		);
	if (settings.courseOrder)
		Object.entries(settings.courseOrder).forEach(([tab, ids]) =>
			localStorage.setItem('course-order-' + tab, JSON.stringify(ids)),
		);
	// Seating layouts — stored per course ID
	if (settings.seatingLayouts)
		Object.entries(settings.seatingLayouts).forEach(([id, layout]) =>
			localStorage.setItem('gcdash-seating-' + id, JSON.stringify(layout)),
		);
	// Room layouts
	if (settings.roomLayouts)
		localStorage.setItem(
			'gcdash-seating-rooms',
			JSON.stringify(settings.roomLayouts),
		);
	// Seating meta field labels
	if (settings.seatingMetaLabels) {
		const existing = JSON.parse(
			localStorage.getItem('gcdash-seating-settings') || '{}',
		);
		existing.metaLabels = settings.seatingMetaLabels;
		localStorage.setItem('gcdash-seating-settings', JSON.stringify(existing));
	}
	if (settings.topicOrders)
		Object.entries(settings.topicOrders).forEach(([id, order]) =>
			localStorage.setItem('topic-order-' + id, JSON.stringify(order)),
		);
	if (settings.topicCollapsed)
		Object.entries(settings.topicCollapsed).forEach(([id, collapsed]) =>
			localStorage.setItem('topic-collapsed-' + id, JSON.stringify(collapsed)),
		);
	if (settings.combineEnabled !== undefined) {
		combineMode = !!settings.combineEnabled;
		localStorage.setItem('gcdash-combine-enabled', combineMode ? '1' : '0');
	}
	if (settings.combineIds) {
		combineIds = settings.combineIds;
		localStorage.setItem('gcdash-combine-ids', JSON.stringify(combineIds));
	}
	if (courses.length) renderCourses();
}

function collectSettings() {
	const courseColors = {},
		courseOrder = {},
		seatingLayouts = {},
		topicOrders = {},
		topicCollapsed = {};
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key.startsWith('course-color-'))
			courseColors[key.replace('course-color-', '')] =
				localStorage.getItem(key);
		if (key.startsWith('course-order-'))
			courseOrder[key.replace('course-order-', '')] = JSON.parse(
				localStorage.getItem(key),
			);
		if (key.startsWith('topic-order-'))
			try { topicOrders[key.replace('topic-order-', '')] = JSON.parse(localStorage.getItem(key)); } catch {}
		if (key.startsWith('topic-collapsed-'))
			try { topicCollapsed[key.replace('topic-collapsed-', '')] = JSON.parse(localStorage.getItem(key)); } catch {}
		if (
			key.startsWith('gcdash-seating-') &&
			!key.includes('rooms') &&
			!key.includes('settings') &&
			!key.includes('grades')
		) {
			try {
				seatingLayouts[key.replace('gcdash-seating-', '')] = JSON.parse(
					localStorage.getItem(key),
				);
			} catch {}
		}
	}
	// Room layouts
	let roomLayouts = {};
	try {
		roomLayouts = JSON.parse(
			localStorage.getItem('gcdash-seating-rooms') || '{}',
		);
	} catch {}
	// Seating meta labels
	let seatingMetaLabels = {};
	try {
		const s = JSON.parse(
			localStorage.getItem('gcdash-seating-settings') || '{}',
		);
		seatingMetaLabels = s.metaLabels || {};
	} catch {}

	return {
		courseColors,
		courseOrder,
		seatingLayouts,
		roomLayouts,
		seatingMetaLabels,
		topicOrders,
		topicCollapsed,
		combineEnabled: localStorage.getItem('gcdash-combine-enabled') === '1',
		combineIds: JSON.parse(localStorage.getItem('gcdash-combine-ids') || '[]'),
		updatedAt: new Date().toISOString(),
	};
}

function debouncedSave() {
	clearTimeout(syncTimeout);
	syncTimeout = setTimeout(saveSettingsToDrive, 1500);
}

async function saveSettingsToDrive() {
	if (!accessToken || !driveFolderId) return;
	const body = JSON.stringify(collectSettings(), null, 2);
	try {
		if (driveFileId) {
			await fetch(
				`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`,
				{
					method: 'PATCH',
					headers: {
						Authorization: 'Bearer ' + accessToken,
						'Content-Type': 'application/json',
					},
					body,
				},
			);
		} else {
			const form = new FormData();
			form.append(
				'metadata',
				new Blob(
					[JSON.stringify({ name: DRIVE_FILE_NAME, parents: [driveFolderId] })],
					{ type: 'application/json' },
				),
			);
			form.append('file', new Blob([body], { type: 'application/json' }));
			const r = await fetch(
				'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
				{
					method: 'POST',
					headers: { Authorization: 'Bearer ' + accessToken },
					body: form,
				},
			);
			driveFileId = (await r.json()).id;
		}
		console.log('Settings synced to Drive ✓');
	} catch (e) {
		console.log('Drive sync failed:', e.message);
	}
}

/* ------------------------------------------------------------
   Quick Links Panel
   ------------------------------------------------------------ */

const DEFAULT_LINKS = [
	{ name: 'Aeries', url: 'https://coalingahuron.aeries.net/' },
	{
		name: 'Parent Square',
		url: 'https://www.parentsquare.com/schools/8597/feeds',
	},
	{ name: 'DMS', url: 'https://dms.fcoe.org/' },
	{
		name: 'eSchool',
		url: 'https://coalinga-huron.eschoolsolutions.com/logOnInitAction.do',
	},
	{ name: 'CHUSD', url: 'https://www.chusd.org/' },
	{ name: 'CHS', url: 'https://chs.chusd.org/' },
	{ name: 'Gmail', url: 'https://mail.google.com/' },
	{ name: 'Navigate360', url: 'https://ems.navigate360.com/login' },
	{ name: '📞 Main Office', url: 'tel:15599357520,14502' },
];

function loadLinks() {
	const s = localStorage.getItem('gcdash-quick-links');
	return s ? JSON.parse(s) : DEFAULT_LINKS;
}
function saveLinks(links) {
	localStorage.setItem('gcdash-quick-links', JSON.stringify(links));
}

function renderQuickLinks() {
	const links = loadLinks();
	const grid = document.getElementById('quick-links-grid');
	grid.innerHTML = '';
	links.forEach((link, i) => {
		const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=32`;
		const a = document.createElement('a');
		a.className = 'quick-link-item';
		a.href = link.url;
		a.target = '_blank';
		a.rel = 'noopener';
		a.innerHTML = `<img src="${favicon}" alt="" onerror="this.style.display='none'">${esc(link.name)}<span class="quick-link-delete" onclick="deleteLink(event,${i})">✕</span>`;
		grid.appendChild(a);
	});
}

function toggleAddLink() {
	const form = document.getElementById('add-link-form');
	form.style.display = form.style.display === 'none' ? 'flex' : 'none';
	if (form.style.display === 'flex')
		document.getElementById('link-name').focus();
}

function saveNewLink() {
	const name = document.getElementById('link-name').value.trim();
	const url = document.getElementById('link-url').value.trim();
	if (!name || !url) return;
	const links = loadLinks();
	links.push({
		name,
		url:
			url.startsWith('http') || url.startsWith('tel:') ? url : 'https://' + url,
	});
	saveLinks(links);
	renderQuickLinks();
	document.getElementById('link-name').value = '';
	document.getElementById('link-url').value = '';
	toggleAddLink();
}

function deleteLink(e, index) {
	e.preventDefault();
	e.stopPropagation();
	const links = loadLinks();
	links.splice(index, 1);
	saveLinks(links);
	renderQuickLinks();
}

function showQuickLinks() {
	document.getElementById('quick-links-section').style.display = 'block';
	renderQuickLinks();
}

/* ------------------------------------------------------------
   Drag and Drop
   ------------------------------------------------------------ */

function getStorageKey(tabKey) {
	return 'course-order-' + tabKey;
}
function getSavedOrder(tabKey) {
	const s = localStorage.getItem(getStorageKey(tabKey));
	return s ? JSON.parse(s) : null;
}
function saveOrder(tabKey, ids) {
	localStorage.setItem(getStorageKey(tabKey), JSON.stringify(ids));
}

function applyOrder(list, tabKey) {
	const saved = getSavedOrder(tabKey);
	if (!saved) return list;
	return [...list].sort((a, b) => {
		const ai = saved.indexOf(a.id),
			bi = saved.indexOf(b.id);
		if (ai === -1) return 1;
		if (bi === -1) return -1;
		return ai - bi;
	});
}

function enableDragAndDrop(grid, tabKey) {
	let dragSrc = null;
	grid.querySelectorAll('.course-card').forEach((card) => {
		card.draggable = true;
		card.addEventListener('dragstart', (e) => {
			dragSrc = card;
			card.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
		});
		card.addEventListener('dragend', () => {
			card.classList.remove('dragging');
			grid
				.querySelectorAll('.course-card')
				.forEach((c) => c.classList.remove('drag-over'));
			saveOrder(
				tabKey,
				[...grid.querySelectorAll('.course-card')].map((c) => c.dataset.id),
			);
			debouncedSave();
		});
		card.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			grid
				.querySelectorAll('.course-card')
				.forEach((c) => c.classList.remove('drag-over'));
			if (card !== dragSrc) card.classList.add('drag-over');
		});
		card.addEventListener('drop', (e) => {
			e.preventDefault();
			if (dragSrc && dragSrc !== card) {
				const cards = [...grid.querySelectorAll('.course-card')];
				const si = cards.indexOf(dragSrc),
					ti = cards.indexOf(card);
				grid.insertBefore(dragSrc, si < ti ? card.nextSibling : card);
			}
			card.classList.remove('drag-over');
		});
	});
}

/* ------------------------------------------------------------
   Course Card Colors
   ------------------------------------------------------------ */

const COURSE_COLORS = [
	{ label: 'None', value: null },
	{ label: 'Blue (dark)', value: '#1A56DB' },
	{ label: 'Blue (light)', value: '#93C5FD' },
	{ label: 'Purple (dark)', value: '#7E22CE' },
	{ label: 'Purple (light)', value: '#D8B4FE' },
	{ label: 'Green (dark)', value: '#166534' },
	{ label: 'Green (light)', value: '#86EFAC' },
	{ label: 'Orange (dark)', value: '#C2410C' },
	{ label: 'Orange (light)', value: '#FDB37A' },
	{ label: 'Red (dark)', value: '#B91C1C' },
	{ label: 'Red (light)', value: '#FCA5A5' },
	{ label: 'Yellow (dark)', value: '#B45309' },
	{ label: 'Yellow (light)', value: '#FDE68A' },
	{ label: 'Teal (dark)', value: '#0E7490' },
	{ label: 'Teal (light)', value: '#67E8F9' },
	{ label: 'Graphite (dark)', value: '#374151' },
	{ label: 'Graphite (light)', value: '#9CA3AF' },
];

function getCourseColor(id) {
	return localStorage.getItem('course-color-' + id) || null;
}
function setCourseColor(id, color) {
	color
		? localStorage.setItem('course-color-' + id, color)
		: localStorage.removeItem('course-color-' + id);
}

function getTextColor(hex) {
	if (!hex) return '';
	const r = parseInt(hex.slice(1, 3), 16),
		g = parseInt(hex.slice(3, 5), 16),
		b = parseInt(hex.slice(5, 7), 16);
	return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#333333' : '#ffffff';
}

function applyCardColor(div, color) {
	if (!color) {
		div.style.background = '';
		div.style.color = '';
		div.style.border = '';
		return;
	}
	div.style.background = color;
	div.style.color = getTextColor(color);
	div.style.border = '1px solid #5f6368';
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
	COURSE_COLORS.forEach((c) => {
		const sw = document.createElement('div');
		sw.className = 'color-swatch' + (c.value === null ? ' none' : '');
		if (c.value) sw.style.background = c.value;
		if (getCourseColor(courseId) === c.value) sw.classList.add('selected');
		sw.title = c.label;
		sw.onclick = (e) => {
			e.stopPropagation();
			setCourseColor(courseId, c.value);
			applyCardColor(div, c.value);
			const btn = div.querySelector('.color-picker-btn');
			btn.style.background = c.value || '#f1f3f4';
			btn.style.borderColor = c.value ? getTextColor(c.value) : '#5f6368';
			palette.remove();
			openPalette = null;
			debouncedSave();
		};
		palette.appendChild(sw);
	});
	div.appendChild(palette);
	openPalette = palette;
	setTimeout(() => {
		document.addEventListener(
			'click',
			() => {
				palette.remove();
				openPalette = null;
			},
			{ once: true },
		);
	}, 0);
}

/* ------------------------------------------------------------
   Courses UI
   ------------------------------------------------------------ */

function toggleOwned() {
	showOwnedOnly = !showOwnedOnly;
	document.getElementById('owned-toggle').textContent = showOwnedOnly
		? 'Showing: My courses'
		: 'Showing: All courses';
	renderCourses();
}

function renderCourses() {
	document.getElementById('setup-section').style.display = 'none';
	document.getElementById('courses-section').style.display = 'block';
	document.getElementById('signout-btn').style.display = 'block';

	const filtered = showOwnedOnly
		? courses.filter((c) => c.teacherFolder)
		: courses;
	// Exclude DECLINED courses — nothing useful to do with them
	const groups = { ACTIVE: [], ARCHIVED: [], OTHER: [] };
	filtered.forEach((c) => {
		const s = c.courseState || 'OTHER';
		if (s === 'DECLINED') return; // skip declined
		(groups[s] || groups.OTHER).push(c);
	});

	const tabDefs = [
		{ key: 'ACTIVE', label: 'Active' },
		{ key: 'ARCHIVED', label: 'Archived' },
		{ key: 'OTHER', label: 'Other' },
	].filter((t) => groups[t.key].length > 0);

	if (!tabDefs.find((t) => t.key === activeTab) && tabDefs.length)
		activeTab = tabDefs[0].key;

	const tabsEl = document.getElementById('course-tabs');
	const panelsEl = document.getElementById('course-tab-panels');
	tabsEl.innerHTML = panelsEl.innerHTML = '';

	tabDefs.forEach((t) => {
		const btn = document.createElement('button');
		btn.className = 'tab' + (t.key === activeTab ? ' active' : '');
		btn.dataset.key = t.key;
		btn.innerHTML = `${t.label} <span class="tab-badge">${groups[t.key].length}</span>`;
		btn.onclick = () => switchTab(t.key);
		tabsEl.appendChild(btn);

		const panel = document.createElement('div');
		panel.className = 'tab-panel' + (t.key === activeTab ? ' active' : '');
		panel.id = 'tab-panel-' + t.key;

		const grid = document.createElement('div');
		grid.className = 'course-grid';

		applyOrder(groups[t.key], t.key).forEach((c) => {
			const div = document.createElement('div');
			const combineIdx = combineIds.indexOf(c.id);
			div.className =
				'course-card' +
				(!combineMode && c.id === selectedId ? ' selected' : '') +
				(combineMode && combineIdx !== -1 ? ' combine-picked' : '');
			div.dataset.id = c.id;
			div.onclick = () =>
				combineMode ? toggleCombineCourse(c.id) : selectCourse(c.id);

			const saved = getCourseColor(c.id);
			applyCardColor(div, saved);
			if (!combineMode && c.id === selectedId) div.style.border = '3px solid #F26522';

			div.innerHTML = `<h3>${esc(c.name)}</h3><div class="meta">${esc(c.section || '')}${c.room ? ' · ' + esc(c.room) : ''}</div>`;

			if (combineMode && combineIdx !== -1) {
				const badge = document.createElement('div');
				badge.className = 'combine-badge';
				badge.textContent = combineIdx + 1;
				div.appendChild(badge);
			}

			const colorBtn = document.createElement('div');
			colorBtn.className = 'color-picker-btn';
			colorBtn.style.background = saved || '#f1f3f4';
			colorBtn.style.borderColor = saved ? getTextColor(saved) : '#5f6368';
			colorBtn.title = 'Pick a color';
			colorBtn.onclick = (e) => togglePalette(e, c.id, div);
			div.appendChild(colorBtn);
			grid.appendChild(div);
		});

		panel.appendChild(grid);
		enableDragAndDrop(grid, t.key);
		panelsEl.appendChild(panel);
	});

	const combineToggle = document.getElementById('combine-toggle');
	if (combineToggle) combineToggle.checked = combineMode;
	updateFetchButtonState();
}

function switchTab(key) {
	activeTab = key;
	document
		.querySelectorAll('.tab')
		.forEach((el) => el.classList.toggle('active', el.dataset.key === key));
	document
		.querySelectorAll('.tab-panel')
		.forEach((el) =>
			el.classList.toggle('active', el.id === 'tab-panel-' + key),
		);
}

function selectCourse(id) {
	selectedId = id;
	document.querySelectorAll('.course-card').forEach((el) => {
		el.classList.toggle('selected', el.dataset.id === id);
		const hasColor = !!getCourseColor(el.dataset.id);
		el.style.border =
			el.dataset.id === id
				? '3px solid #F26522'
				: hasColor ? '1px solid #5f6368' : '';
	});
	updateFetchButtonState();
	// Only show Seating Chart button for ACTIVE courses
	const course = courses.find((c) => c.id === id);
	const seatingBtn = document.getElementById('seating-btn');
	if (seatingBtn) {
		if (course && course.courseState === 'ACTIVE') {
			seatingBtn.style.display = '';
			seatingBtn.onclick = () => {
				localStorage.setItem('gcdash-seating-course', id);
			};
		} else {
			seatingBtn.style.display = 'none';
			seatingBtn.onclick = null;
		}
	}
}

/* ------------------------------------------------------------
   Combine Classrooms
   ------------------------------------------------------------ */

function toggleCombineMode(checked) {
	combineMode = checked;
	localStorage.setItem('gcdash-combine-enabled', checked ? '1' : '0');
	debouncedSave();
	renderCourses();
}

function toggleCombineCourse(id) {
	const idx = combineIds.indexOf(id);
	if (idx === -1) combineIds.push(id);
	else combineIds.splice(idx, 1);
	localStorage.setItem('gcdash-combine-ids', JSON.stringify(combineIds));
	debouncedSave();
	renderCourses();
}

function updateFetchButtonState() {
	const btn = document.getElementById('fetch-btn');
	if (!btn) return;
	if (combineMode) {
		btn.disabled = combineIds.length < 2;
		const seatingBtn = document.getElementById('seating-btn');
		if (seatingBtn) seatingBtn.style.display = 'none';
	} else {
		btn.disabled = !selectedId;
	}
}

/* ------------------------------------------------------------
   Detail Panel
   ------------------------------------------------------------ */

function showDetail(courseId) {
	const course = courses.find((c) => c.id === courseId);

	document.getElementById('detail-title').textContent = course.name;
	document.getElementById('detail-body').innerHTML = '';
	document.getElementById('detail-actions').style.display = 'flex';
	selectedTopicBlock = null;

	const body = document.getElementById('detail-body');
	renderCourseTopics(body, courseId, courseData[courseId]);

	document.getElementById('detail-section').style.display = 'block';
	document.getElementById('detail-section').scrollIntoView({ behavior: 'smooth' });
}

function showCombinedDetail(ids) {
	document.getElementById('detail-title').textContent = 'Combined Outline';
	document.getElementById('detail-actions').style.display = 'flex';

	const body = document.getElementById('detail-body');
	body.innerHTML = '';
	selectedTopicBlock = null;

	ids.forEach((id) => {
		const course = courses.find((c) => c.id === id);
		const heading = document.createElement('div');
		heading.className = 'combine-course-heading';
		heading.textContent = course ? course.name : id;
		body.appendChild(heading);

		const section = document.createElement('div');
		section.className = 'combine-course-section';
		body.appendChild(section);

		renderCourseTopics(section, id, courseData[id]);
	});

	document.getElementById('detail-section').style.display = 'block';
	document.getElementById('detail-section').scrollIntoView({ behavior: 'smooth' });
}

function renderCourseTopics(body, courseId, data) {
	body.dataset.courseId = courseId;
	const { assignments, materials, topicMap } = data;
	const merged = mergeByTopic(assignments, materials, topicMap);

	// Apply saved topic order
	const savedOrder = getTopicOrder(courseId);
	if (savedOrder) {
		merged.sort((a, b) => {
			const ai = savedOrder.indexOf(a.topicId);
			const bi = savedOrder.indexOf(b.topicId);
			if (ai === -1 && bi === -1) return 0;
			if (ai === -1) return 1;
			if (bi === -1) return -1;
			return ai - bi;
		});
	}

	const hasSavedCollapse = localStorage.getItem('topic-collapsed-' + courseId) !== null;
	const collapsedSet = hasSavedCollapse
		? getTopicCollapsed(courseId)
		: new Set(merged.map((g) => g.topicId));

	if (!merged.length) {
		body.innerHTML = `<div class="empty-note">No assignments or materials found.</div>`;
	} else {
		// Expand All / Collapse All controls
		if (merged.length > 1) {
			const controls = document.createElement('div');
			controls.className = 'detail-controls';
			const btnExpand = document.createElement('button');
			btnExpand.className = 'btn';
			btnExpand.textContent = 'Expand all';
			btnExpand.onclick = () => expandAllTopics(courseId);
			const btnCollapse = document.createElement('button');
			btnCollapse.className = 'btn';
			btnCollapse.textContent = 'Collapse all';
			btnCollapse.onclick = () => collapseAllTopics(courseId);
			controls.appendChild(btnExpand);
			controls.appendChild(btnCollapse);
			body.appendChild(controls);
		}

		let dragSrc = null;

		function updateMoveButtons() {
			const blocks = [...body.querySelectorAll('.topic-block')];
			blocks.forEach((b, i) => {
				const up = b.querySelector('.topic-move-up');
				const down = b.querySelector('.topic-move-down');
				if (up) up.disabled = i === 0;
				if (down) down.disabled = i === blocks.length - 1;
			});
		}

		function moveTopicBlock(block, direction) {
			const blocks = [...body.querySelectorAll('.topic-block')];
			const idx = blocks.indexOf(block);
			const targetIdx = idx + direction;
			if (targetIdx < 0 || targetIdx >= blocks.length) return;
			const target = blocks[targetIdx];
			if (direction < 0) body.insertBefore(block, target);
			else body.insertBefore(target, block);
			setSelectedTopicBlock(block);
			updateMoveButtons();
			saveTopicOrder(courseId);
			debouncedSave();
		}

		merged.forEach((g) => {
			const block = document.createElement('div');
			block.className = 'topic-block' + (collapsedSet.has(g.topicId) ? ' collapsed' : '');
			block.dataset.topicId = g.topicId;

			// Header
			const header = document.createElement('div');
			header.className = 'topic-label';

			const handle = document.createElement('span');
			handle.className = 'topic-handle';
			handle.textContent = '⠿';
			handle.title = 'Drag to reorder';

			const moveUp = document.createElement('button');
			moveUp.type = 'button';
			moveUp.className = 'topic-move-btn topic-move-up';
			moveUp.textContent = '▲';
			moveUp.title = 'Move up';
			moveUp.setAttribute('aria-label', 'Move week up');
			moveUp.addEventListener('click', (e) => {
				e.stopPropagation();
				moveTopicBlock(block, -1);
			});

			const moveDown = document.createElement('button');
			moveDown.type = 'button';
			moveDown.className = 'topic-move-btn topic-move-down';
			moveDown.textContent = '▼';
			moveDown.title = 'Move down';
			moveDown.setAttribute('aria-label', 'Move week down');
			moveDown.addEventListener('click', (e) => {
				e.stopPropagation();
				moveTopicBlock(block, 1);
			});

			const nameEl = document.createElement('span');
			nameEl.className = 'topic-name';
			nameEl.textContent = g.topicName;

			const chevron = document.createElement('span');
			chevron.className = 'topic-chevron';
			chevron.textContent = '▼';

			header.appendChild(handle);
			header.appendChild(moveUp);
			header.appendChild(moveDown);
			header.appendChild(nameEl);
			header.appendChild(chevron);

			// Click header to toggle (not the handle)
			header.addEventListener('click', (e) => {
				if (handle.contains(e.target)) return;
				block.classList.toggle('collapsed');
				saveTopicCollapsed(courseId);
				debouncedSave();
				toggleSelectedTopicBlock(block);
			});

			block.appendChild(header);

			// Content wrapper
			const content = document.createElement('div');
			content.className = 'topic-content';

			if (g.assignments.length) {
				const lbl = document.createElement('div');
				lbl.className = 'section-heading';
				lbl.textContent = 'Assignments';
				content.appendChild(lbl);
				const ul = document.createElement('ul');
				ul.className = 'item-list';
				g.assignments.forEach((a) => {
					const li = document.createElement('li');
					li.innerHTML = `
						<div class="item-title">${esc(a.title)}</div>
						<div class="item-meta">${a.dueDate ? 'Due: ' + fmtDate(a.dueDate) : 'No due date'}${a.maxPoints ? ' · ' + a.maxPoints + ' pts' : ''}</div>
						${a.description ? '<div class="item-desc">' + esc(a.description.slice(0, 120)) + (a.description.length > 120 ? '…' : '') + '</div>' : ''}
						${renderAttachments(a.materials)}`;
					ul.appendChild(li);
				});
				content.appendChild(ul);
			}

			if (g.materials.length) {
				const lbl = document.createElement('div');
				lbl.className = 'section-heading';
				lbl.textContent = 'Materials';
				content.appendChild(lbl);
				const ul = document.createElement('ul');
				ul.className = 'item-list';
				g.materials.forEach((m) => {
					const li = document.createElement('li');
					li.innerHTML = `
						<div class="item-title">${esc(m.title)}</div>
						${m.description ? '<div class="item-desc">' + esc(m.description.slice(0, 120)) + (m.description.length > 120 ? '…' : '') + '</div>' : ''}
						${renderAttachments(m.materials)}`;
					ul.appendChild(li);
				});
				content.appendChild(ul);
			}

			block.appendChild(content);

			// Drag — only initiates from handle
			handle.addEventListener('mousedown', () => {
				block.draggable = true;
				if (!block.classList.contains('collapsed')) {
					block.classList.add('collapsed');
					saveTopicCollapsed(courseId);
				}
			});

			block.addEventListener('dragstart', (e) => {
				dragSrc = block;
				e.dataTransfer.effectAllowed = 'move';
				setTimeout(() => block.classList.add('dragging'), 0);
			});

			block.addEventListener('dragend', () => {
				block.draggable = false;
				block.classList.remove('dragging');
				body.querySelectorAll('.topic-block').forEach(b => b.classList.remove('drag-over'));
				updateMoveButtons();
				saveTopicOrder(courseId);
				debouncedSave();
			});

			block.addEventListener('dragover', (e) => {
				e.preventDefault();
				if (dragSrc && dragSrc !== block) block.classList.add('drag-over');
			});

			block.addEventListener('dragleave', () => block.classList.remove('drag-over'));

			block.addEventListener('drop', (e) => {
				e.preventDefault();
				block.classList.remove('drag-over');
				if (!dragSrc || dragSrc === block) return;
				const blocks = [...body.querySelectorAll('.topic-block')];
				const si = blocks.indexOf(dragSrc);
				const ti = blocks.indexOf(block);
				body.insertBefore(dragSrc, si < ti ? block.nextSibling : block);
			});

			body.appendChild(block);
		});

		updateMoveButtons();
	}
}

/* Topic selection — highlights the block being moved with the arrow buttons */
function setSelectedTopicBlock(block) {
	if (selectedTopicBlock === block) return;
	if (selectedTopicBlock) selectedTopicBlock.classList.remove('topic-selected');
	selectedTopicBlock = block;
	if (selectedTopicBlock) selectedTopicBlock.classList.add('topic-selected');
}

function toggleSelectedTopicBlock(block) {
	setSelectedTopicBlock(selectedTopicBlock === block ? null : block);
}

document.addEventListener('click', (e) => {
	if (selectedTopicBlock && !e.target.closest('.topic-block')) {
		setSelectedTopicBlock(null);
	}
});

/* Topic order & collapse state helpers */
function getTopicOrder(courseId) {
	try {
		const s = localStorage.getItem('topic-order-' + courseId);
		return s ? JSON.parse(s) : null;
	} catch { return null; }
}

function getCourseTopicContainer(courseId) {
	return document.querySelector('[data-course-id="' + courseId + '"]') ||
		document.getElementById('detail-body');
}

function saveTopicOrder(courseId) {
	const body = getCourseTopicContainer(courseId);
	const order = [...body.querySelectorAll('.topic-block')].map(b => b.dataset.topicId);
	localStorage.setItem('topic-order-' + courseId, JSON.stringify(order));
}

function getTopicCollapsed(courseId) {
	try {
		const s = localStorage.getItem('topic-collapsed-' + courseId);
		return s ? new Set(JSON.parse(s)) : new Set();
	} catch { return new Set(); }
}

function saveTopicCollapsed(courseId) {
	const body = getCourseTopicContainer(courseId);
	if (!body) return;
	const collapsed = [...body.querySelectorAll('.topic-block.collapsed')].map(b => b.dataset.topicId);
	localStorage.setItem('topic-collapsed-' + courseId, JSON.stringify(collapsed));
}

function expandAllTopics(courseId) {
	getCourseTopicContainer(courseId).querySelectorAll('.topic-block').forEach(b => b.classList.remove('collapsed'));
	saveTopicCollapsed(courseId);
	debouncedSave();
}

function collapseAllTopics(courseId) {
	getCourseTopicContainer(courseId).querySelectorAll('.topic-block').forEach(b => b.classList.add('collapsed'));
	saveTopicCollapsed(courseId);
	debouncedSave();
}

function closeDetail() {
	document.getElementById('detail-section').style.display = 'none';
	document.getElementById('detail-actions').style.display = 'flex';
}

/* ------------------------------------------------------------
   Print View
   ------------------------------------------------------------ */

function openPrintView(mode) {
	if (combineMode) {
		if (combineIds.length < 2) return;
		const list = combineIds
			.map((id) => ({ course: courses.find((c) => c.id === id), data: courseData[id] }))
			.filter((x) => x.course && x.data);
		if (list.length < 2) return;
		const w = window.open('', '_blank');
		w.document.write(buildCombinedPrintHtml(list, mode));
		w.document.close();
		return;
	}
	const course = courses.find((c) => c.id === selectedId);
	if (!course) return;
	const data = courseData[selectedId];
	if (!data) return;
	const w = window.open('', '_blank');
	w.document.write(buildPrintHtml(course, data, mode));
	w.document.close();
}

function renderCourseHeaderHtml(course, mode) {
	const isSummary = mode === 'summary';
	return `<div class="course-header">
    <span class="mode-label">${isSummary ? 'Summary Outline' : 'Detailed Outline'}</span>
    <h1>${escHtml(course.name)}</h1>
    <div class="course-meta">
      ${course.section ? escHtml(course.section) : ''}${course.room ? ' &nbsp;·&nbsp; Room ' + escHtml(course.room) : ''}
      ${course.description ? '<br><em>' + escHtml(course.description) + '</em>' : ''}
    </div>
  </div>`;
}

function renderTopicBlocksHtml(course, data, mode) {
	const merged = mergeByTopic(data.assignments, data.materials, data.topicMap);
	const savedOrder = getTopicOrder(course.id);
	if (savedOrder) {
		merged.sort((a, b) => {
			const ai = savedOrder.indexOf(a.topicId);
			const bi = savedOrder.indexOf(b.topicId);
			if (ai === -1 && bi === -1) return 0;
			if (ai === -1) return 1;
			if (bi === -1) return -1;
			return ai - bi;
		});
	}
	const isSummary = mode === 'summary';
	let body = '';

	merged.forEach((g) => {
		body += `<div class="topic-block"><div class="topic-heading">${escHtml(g.topicName)}</div>`;
		if (g.assignments.length) {
			body += `<div class="sub-label">Assignments</div><ul>`;
			g.assignments.forEach((a) => {
				body += `<li class="assignment-item">
          <div class="item-title">${escHtml(a.title)}${a.maxPoints ? ` <span class="pts">${a.maxPoints} pts</span>` : ''}</div>
          ${!isSummary && a.description ? `<div class="item-desc">${escHtml(a.description)}</div>` : ''}
          ${!isSummary ? printAttachments(a.materials) : ''}
        </li>`;
			});
			body += `</ul>`;
		}
		if (g.materials.length) {
			body += `<div class="sub-label">Materials</div><ul>`;
			g.materials.forEach((m) => {
				body += `<li class="assignment-item">
          <div class="item-title">${escHtml(m.title)}</div>
          ${!isSummary && m.description ? `<div class="item-desc">${escHtml(m.description)}</div>` : ''}
          ${!isSummary ? printAttachments(m.materials) : ''}
        </li>`;
			});
			body += `</ul>`;
		}
		body += `</div>`;
	});

	return body;
}

const PRINT_STYLES = `
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
  .topic-block { border: 1px solid #ddd; border-radius: 10px; padding: 1rem; margin-bottom: 1.5rem; page-break-inside: avoid; }
  .topic-heading { font-size: 14px; font-weight: 700; color: #fff; background: #F26522; padding: 6px 12px; border-radius: 6px; margin-bottom: 10px; display: inline-block; }
  .sub-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin: 8px 0 6px; }
  ul { list-style: none; padding-left: 0; }
  li.assignment-item { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 14px; margin-bottom: 6px; page-break-inside: avoid; background: #fafafa; }
  .item-title { font-size: 14px; font-weight: 600; color: #111; }
  .pts { font-size: 12px; font-weight: 400; color: #F26522; margin-left: 6px; }
  .item-desc { font-size: 13px; color: #444; margin-top: 4px; line-height: 1.5; white-space: pre-wrap; }
  .item-attachments { margin-top: 6px; font-size: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
  .item-attachments a { color: #F26522; text-decoration: none; }
  .footer { margin-top: 3rem; font-size: 11px; color: #aaa; border-top: 0.5px solid #eee; padding-top: 8px; }
  .combine-section + .combine-section { page-break-before: always; margin-top: 2rem; }
  @media print { body { padding: 1rem; } .topic-heading { background: #F26522 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } li.assignment-item { background: #fff !important; } }
`;

function buildPrintHtml(course, data, mode) {
	const isSummary = mode === 'summary';
	const body = renderTopicBlocksHtml(course, data, mode);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(course.name)} — ${isSummary ? 'Summary' : 'Detailed'} Outline</title>
<style>
  ${PRINT_STYLES}
  li.assignment-item { padding: ${isSummary ? '6px 12px' : '10px 14px'}; }
  .item-title { font-size: ${isSummary ? '13px' : '14px'}; }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  ${renderCourseHeaderHtml(course, mode)}
  ${body}
  <div class="footer">Generated ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</body>
</html>`;
}

function buildCombinedPrintHtml(list, mode) {
	const isSummary = mode === 'summary';
	const title = list.map((x) => x.course.name).join(' + ');

	const sections = list
		.map(
			(x) =>
				`<div class="combine-section">${renderCourseHeaderHtml(x.course, mode)}${renderTopicBlocksHtml(x.course, x.data, mode)}</div>`,
		)
		.join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)} — ${isSummary ? 'Summary' : 'Detailed'} Outline</title>
<style>
  ${PRINT_STYLES}
  li.assignment-item { padding: ${isSummary ? '6px 12px' : '10px 14px'}; }
  .item-title { font-size: ${isSummary ? '13px' : '14px'}; }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  ${sections}
  <div class="footer">Generated ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</body>
</html>`;
}

/* ------------------------------------------------------------
   Markdown Export
   ------------------------------------------------------------ */

function downloadSelectedMd() {
	if (combineMode && combineIds.length >= 2) {
		const list = combineIds
			.map((id) => ({ course: courses.find((x) => x.id === id), data: courseData[id] }))
			.filter((x) => x.course && x.data);
		if (list.length < 2) return;
		download(
			'combined-' + slugify(list.map((x) => x.course.name).join('-')) + '.md',
			combinedCoursesToMd(list),
		);
		return;
	}
	const c = courses.find((x) => x.id === selectedId);
	if (!c) return;
	download(slugify(c.name) + '.md', courseToMd(c, courseData[selectedId]));
}

async function downloadAllMd() {
	const s = document.createElement('script');
	s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
	document.head.appendChild(s);
	await new Promise((r) => (s.onload = r));
	const zip = new JSZip();
	courses.forEach((c) =>
		zip.file(slugify(c.name) + '.md', courseToMd(c, courseData[c.id])),
	);
	const blob = await zip.generateAsync({ type: 'blob' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'classroom-courses.zip';
	a.click();
	URL.revokeObjectURL(url);
}

function courseToMd(c, data) {
	const lines = [];
	lines.push('---');
	lines.push(`title: "${(c.name || 'Untitled').replace(/"/g, '\\"')}"`);
	if (c.section) lines.push(`section: "${c.section}"`);
	if (c.room) lines.push(`room: "${c.room}"`);
	if (c.courseState) lines.push(`state: "${c.courseState}"`);
	if (c.creationTime)
		lines.push(`createdAt: "${c.creationTime.split('T')[0]}"`);
	if (c.updateTime) lines.push(`updatedAt: "${c.updateTime.split('T')[0]}"`);
	if (c.enrollmentCode) lines.push(`enrollmentCode: "${c.enrollmentCode}"`);
	if (c.alternateLink) lines.push(`classroomUrl: "${c.alternateLink}"`);
	if (c.description)
		lines.push(
			`description: "${c.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
		);
	lines.push('---');
	lines.push('');

	if (data) lines.push(...courseTopicsToMdLines(data));
	return lines.join('\n');
}

function courseTopicsToMdLines(data) {
	const lines = [];
	mergeByTopic(data.assignments, data.materials, data.topicMap || {}).forEach(
		(g) => {
			lines.push('## ' + g.topicName);
			lines.push('');
			if (g.assignments.length) {
				lines.push('### Assignments');
				lines.push('');
				g.assignments.forEach((a) => {
					lines.push('#### ' + (a.title || 'Untitled'));
					if (a.dueDate) lines.push('- **Due:** ' + fmtDate(a.dueDate));
					if (a.maxPoints) lines.push('- **Points:** ' + a.maxPoints);
					if (a.description)
						lines.push(
							'- **Description:** ' + a.description.replace(/\n/g, ' '),
						);
					if (a.alternateLink)
						lines.push('- **Classroom link:** ' + a.alternateLink);
					const att = attachmentsToMd(a.materials);
					if (att.length) {
						lines.push('- **Attachments:**');
						att.forEach((l) => lines.push(l));
					}
					lines.push('');
				});
			}
			if (g.materials.length) {
				lines.push('### Materials');
				lines.push('');
				g.materials.forEach((m) => {
					lines.push('#### ' + (m.title || 'Untitled'));
					if (m.description)
						lines.push(
							'- **Description:** ' + m.description.replace(/\n/g, ' '),
						);
					if (m.alternateLink)
						lines.push('- **Classroom link:** ' + m.alternateLink);
					const att = attachmentsToMd(m.materials);
					if (att.length) {
						lines.push('- **Attachments:**');
						att.forEach((l) => lines.push(l));
					}
					lines.push('');
				});
			}
		},
	);
	return lines;
}

function combinedCoursesToMd(list) {
	const lines = [];
	lines.push('---');
	lines.push(`title: "${list.map((x) => x.course.name).join(' + ').replace(/"/g, '\\"')}"`);
	lines.push('---');
	lines.push('');
	list.forEach(({ course, data }) => {
		lines.push('# ' + (course.name || 'Untitled'));
		lines.push('');
		lines.push(...courseTopicsToMdLines(data));
	});
	return lines.join('\n');
}

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */

function topicCreationTime(items) {
	const times = items
		.map((it) => (it.creationTime ? new Date(it.creationTime).getTime() : NaN))
		.filter((t) => !isNaN(t));
	return times.length ? Math.min(...times) : Infinity;
}

function mergeByTopic(assignments, materials, topicMap) {
	const groups = {};
	assignments.forEach((a) => {
		const tid = a.topicId || '__none__';
		if (!groups[tid]) groups[tid] = { assignments: [], materials: [] };
		groups[tid].assignments.push(a);
	});
	materials.forEach((m) => {
		const tid = m.topicId || '__none__';
		if (!groups[tid]) groups[tid] = { assignments: [], materials: [] };
		groups[tid].materials.push(m);
	});
	return Object.keys(groups)
		.map((tid) => ({
			topicId: tid,
			topicName:
				tid === '__none__' ? 'No topic' : topicMap[tid] || 'Unknown topic',
			assignments: groups[tid].assignments,
			materials: groups[tid].materials,
			createdAt: topicCreationTime([...groups[tid].assignments, ...groups[tid].materials]),
		}))
		.sort((a, b) => {
			if (a.topicId === '__none__') return 1;
			if (b.topicId === '__none__') return -1;
			return a.createdAt - b.createdAt;
		});
}

function groupByTopic(items, topicMap) {
	const groups = {};
	items.forEach((item) => {
		const tid = item.topicId || '__none__';
		if (!groups[tid]) groups[tid] = [];
		groups[tid].push(item);
	});
	return Object.keys(groups)
		.map((tid) => ({
			topicId: tid,
			topicName:
				tid === '__none__' ? 'No topic' : topicMap[tid] || 'Unknown topic',
			items: groups[tid],
		}))
		.sort((a, b) => {
			if (a.topicId === '__none__') return 1;
			if (b.topicId === '__none__') return -1;
			const aw = /^week\d+/i.test(a.topicName),
				bw = /^week\d+/i.test(b.topicName);
			if (!aw && bw) return -1;
			if (aw && !bw) return 1;
			return a.topicName.localeCompare(b.topicName, undefined, {
				numeric: true,
				sensitivity: 'base',
			});
		});
}

function toTimestamp(item) {
	if (item.dueDate) {
		const d = item.dueDate;
		return new Date(d.year, (d.month || 1) - 1, d.day || 1).getTime();
	}
	if (item.scheduledTime) return new Date(item.scheduledTime).getTime();
	if (item.creationTime) return new Date(item.creationTime).getTime();
	return 0;
}

function fmtDate(d) {
	if (!d) return '';
	return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function esc(s) {
	return String(s || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
function escHtml(s) {
	return String(s || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
function download(filename, text) {
	const a = document.createElement('a');
	a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text);
	a.download = filename;
	a.click();
}
function slugify(s) {
	return String(s || 'untitled')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function renderAttachments(materials) {
	if (!materials || !materials.length) return '';
	const items = materials
		.map((mat) => {
			if (mat.driveFile) {
				const f = mat.driveFile.driveFile;
				return `<a href="${f.alternateLink}" target="_blank">📄 ${esc(f.title || 'Drive file')}</a>`;
			}
			if (mat.youtubeVideo) {
				const v = mat.youtubeVideo;
				return `<a href="${v.alternateLink}" target="_blank">🎬 ${esc(v.title || 'YouTube video')}</a>`;
			}
			if (mat.link) {
				const l = mat.link;
				return `<a href="${l.url}" target="_blank">🔗 ${esc(l.title || l.url)}</a>`;
			}
			if (mat.form) {
				const f = mat.form;
				return `<a href="${f.formUrl}" target="_blank">📝 ${esc(f.title || 'Form')}</a>`;
			}
			return '';
		})
		.filter(Boolean);
	return items.length
		? `<div class="item-attachments">${items.join(' &nbsp; ')}</div>`
		: '';
}

function printAttachments(materials) {
	if (!materials || !materials.length) return '';
	const items = materials
		.map((mat) => {
			if (mat.driveFile) {
				const f = mat.driveFile.driveFile;
				return `<a href="${f.alternateLink}">📄 ${escHtml(f.title || 'Drive file')}</a>`;
			}
			if (mat.youtubeVideo) {
				const v = mat.youtubeVideo;
				return `<a href="${v.alternateLink}">🎬 ${escHtml(v.title || 'YouTube video')}</a>`;
			}
			if (mat.link) {
				const l = mat.link;
				return `<a href="${l.url}">🔗 ${escHtml(l.title || l.url)}</a>`;
			}
			if (mat.form) {
				const f = mat.form;
				return `<a href="${f.formUrl}">📝 ${escHtml(f.title || 'Form')}</a>`;
			}
			return '';
		})
		.filter(Boolean);
	return items.length
		? `<div class="item-attachments">${items.join('')}</div>`
		: '';
}

function attachmentsToMd(materials) {
	if (!materials || !materials.length) return [];
	return materials
		.map((mat) => {
			if (mat.driveFile) {
				const f = mat.driveFile.driveFile;
				return `  - 📄 [${f.title || 'Drive file'}](${f.alternateLink})`;
			}
			if (mat.youtubeVideo) {
				const v = mat.youtubeVideo;
				return `  - 🎬 [${v.title || 'YouTube video'}](${v.alternateLink})`;
			}
			if (mat.link) {
				const l = mat.link;
				return `  - 🔗 [${l.title || l.url}](${l.url})`;
			}
			if (mat.form) {
				const f = mat.form;
				return `  - 📝 [${f.title || 'Form'}](${f.formUrl})`;
			}
			return null;
		})
		.filter(Boolean);
}
// ── Token handoff ─────────────────────────────────────────────────────────
// gcdash-token-handoff is written here after login and read by seating.html
// gcdash-return-token is written by seating.html goHome() and read here
window.addEventListener('load', () => {
	const returnToken = localStorage.getItem('gcdash-return-token');
	if (returnToken) {
		localStorage.removeItem('gcdash-return-token');
		// Hide login UI, show spinner while courses load
		const btn = document.getElementById('connect-btn');
		const status = document.getElementById('auth-status');
		if (btn) btn.style.display = 'none';
		if (status) {
			status.style.display = 'block';
			status.innerHTML =
				'<span class="gcdash-spinner"></span> Loading your classes…';
		}
		accessToken = returnToken;
		fetchCourses();
	}
});
