let students = [];
let masterSubjects = [];
let subjectsList = [];
let subjectsMap = {};

async function loadGlobals() {
    try {
        const res = await apiFetch('/api/settings');
        if (!res.ok) return;
        const settings = await res.json();
        masterSubjects = settings.masterSubjects || [];
        subjectsList = masterSubjects.filter(s => s.active).map(s => s.name);
        subjectsMap = {};
        masterSubjects.forEach(s => subjectsMap[s.name] = s.abbr);
    } catch(e) {}
}

function getAbbreviation(sub) {
    return subjectsMap[sub] || sub.substring(0,3).toUpperCase();
}

let authToken = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');

async function apiFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
    const response = await fetch(url, options);
    if (response.status === 401 || response.status === 403) {
        handleLogout();
        throw new Error("Unauthorized");
    }
    return response;
}

function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    authToken = null;
    currentUser = null;
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

let currentClass = 'Form 1';

function renderActiveTab() {
    const activeTab = document.querySelector('.nav-links li.active');
    if (!activeTab) return;
    const tabId = activeTab.getAttribute('data-tab');
    if (tabId === 'students-tab') renderStudentsTab();
    if (tabId === 'staff-tab') renderStaffTab();
    if (tabId === 'marks-tab') renderMarksTab();
    if (tabId === 'rankings-tab') renderRankingsTab();
}

document.getElementById('global-class-select').addEventListener('change', (e) => {
    currentClass = e.target.value;
    renderActiveTab();
});

async function checkLogin() {
    if (authToken && currentUser) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('user-greeting').innerText = `Welcome, ${currentUser.name}`;
        document.getElementById('class-selector-container').style.display = 'flex';
        
        await loadGlobals();
        
        if (currentUser.role === 'teacher') {
            document.querySelector('[data-tab="students-tab"]').style.display = 'none';
            document.querySelector('[data-tab="staff-tab"]').style.display = 'none';
            document.querySelector('[data-tab="rankings-tab"]').style.display = 'none';
            document.querySelector('[data-tab="whatsapp-tab"]').style.display = 'none';
            document.querySelector('[data-tab="settings-tab"]').style.display = 'none';
            
            document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
            document.querySelector('[data-tab="marks-tab"]').classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('marks-tab').classList.add('active');
            renderMarksTab();
        } else {
            document.querySelectorAll('.nav-links li').forEach(li => li.style.display = 'block');
            renderStudentsTab();
        }
    } else {
        handleLogout();
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username: u, password: p})
    });
    if (res.ok) {
        const data = await res.json();
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('token', authToken);
        localStorage.setItem('user', JSON.stringify(currentUser));
        document.getElementById('login-error').style.display = 'none';
        checkLogin();
    } else {
        document.getElementById('login-error').innerText = "Invalid credentials";
        document.getElementById('login-error').style.display = 'block';
    }
});

document.getElementById('logout-btn').addEventListener('click', handleLogout);

// Handle Tabs Routing
document.querySelectorAll('.nav-links li').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        
        item.classList.add('active');
        const targetTab = item.getAttribute('data-tab');
        document.getElementById(targetTab).classList.add('active');
        
        const tabId = item.getAttribute('data-tab');
        if (tabId === 'students-tab') renderStudentsTab();
        if (tabId === 'staff-tab') renderStaffTab();
        if (tabId === 'marks-tab') renderMarksTab();
        if (targetTab === 'rankings-tab') renderRankingsTab();
        if (targetTab === 'whatsapp-tab') setupWhatsAppStatusPolling();
        if (targetTab === 'settings-tab') loadSettings();
    });
});

async function fetchStudents() {
    const res = await apiFetch('/api/students');
    students = await res.json();
}

// 1. Render Students Tab
async function renderStudentsTab() {
    await fetchStudents();
    
    // Render dynamic table headers
    const thead = document.getElementById('subjects-table-header');
    if (thead) {
        thead.innerHTML = `<th>Student</th><th>Phone</th><th>Bursary</th>` + 
            subjectsList.map(sub => `<th title="${sub}" style="font-size: 10px; writing-mode: vertical-rl; transform: rotate(180deg);">${getAbbreviation(sub)}</th>`).join('');
    }

    const tbody = document.querySelector('#subjects-table tbody');
    tbody.innerHTML = '';
    
    const classStudents = students.filter(s => (s.classLevel || 'Form 1') === currentClass);
    
    classStudents.forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" data-student-id="${student.id}" data-field="name" value="${student.name}" style="width: 120px;"></td>
            <td><input type="text" data-student-id="${student.id}" data-field="phone" value="${student.phone || ''}" style="width: 100px;"></td>
            <td><input type="text" data-student-id="${student.id}" data-field="bursaryName" value="${student.bursaryName || ''}" placeholder="None" style="width: 100px;"></td>
        ` + 
            subjectsList.map(sub => `
                <td>
                    <input type="checkbox" data-student-id="${student.id}" data-subject="${sub}" ${student.subjects[sub] ? 'checked' : ''}>
                </td>
            `).join('');
        tbody.appendChild(tr);
    });
}

// Save Subject Config Checkboxes
document.getElementById('save-subjects-btn').addEventListener('click', async () => {
    const updates = {};
    
    document.querySelectorAll('#subjects-table input[type="checkbox"]').forEach(box => {
        const studentId = box.getAttribute('data-student-id');
        const subject = box.getAttribute('data-subject');
        
        if (!updates[studentId]) updates[studentId] = { subjects: {} };
        updates[studentId].subjects[subject] = box.checked;
    });

    document.querySelectorAll('#subjects-table input[type="text"]').forEach(input => {
        const studentId = input.getAttribute('data-student-id');
        const field = input.getAttribute('data-field');
        if (!updates[studentId]) updates[studentId] = { subjects: {} };
        updates[studentId][field] = input.value;
    });

    const res = await apiFetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
    });

    if (res.ok) {
        alert('Student data and subjects saved!');
        renderStudentsTab();
    } else {
        alert('Error saving data.');
    }
});

// Toggle bursary input
document.getElementById('student-on-bursary').addEventListener('change', (e) => {
    document.getElementById('student-bursary-group').style.display = e.target.checked ? 'block' : 'none';
});

// Add New Student Form
document.getElementById('add-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('student-name').value;
    const phone = document.getElementById('student-phone').value;
    const onBursary = document.getElementById('student-on-bursary').checked;
    const bursaryName = onBursary ? document.getElementById('student-bursary-name').value : '';
    
    const res = await apiFetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, bursaryName, classLevel: currentClass, subjects: {} })
    });
    
    if (res.ok) {
        document.getElementById('student-name').value = '';
        document.getElementById('student-phone').value = '';
        document.getElementById('student-bursary-name').value = '';
        document.getElementById('student-on-bursary').checked = false;
        document.getElementById('student-bursary-group').style.display = 'none';
        alert('Student registered!');
        renderStudentsTab();
    }
});

// Search Student
document.getElementById('student-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#subjects-table tbody tr').forEach(tr => {
        const nameInput = tr.querySelector('input[data-field="name"]');
        if (nameInput && nameInput.value.toLowerCase().includes(term)) {
            tr.style.display = '';
        } else {
            tr.style.display = 'none';
        }
    });
});

// 1.5. Staff Tab
let users = [];

async function renderStaffTab() {
    const res = await apiFetch('/api/users');
    users = await res.json();
    
    // Populate checkboxes
    const cbContainer = document.getElementById('staff-subjects-checkboxes');
    cbContainer.innerHTML = '';
    subjectsList.forEach(sub => {
        cbContainer.innerHTML += `
            <label style="display:flex; align-items:center; gap:5px; font-size:0.9rem;">
                <input type="checkbox" value="${sub}" class="staff-sub-cb"> ${sub}
            </label>
        `;
    });
    
    const tbody = document.querySelector('#staff-table tbody');
    tbody.innerHTML = '';
    
    users.forEach(u => {
        const tr = document.createElement('tr');
        const classSubs = (u.subjects || []).filter(s => s.startsWith(currentClass + ':')).map(s => s.split(':')[1]);
        
        tr.innerHTML = `
            <td>${u.name}</td>
            <td>${u.username}</td>
            <td>${u.role === 'admin' ? 'ALL' : classSubs.join(', ') || 'None'}</td>
            <td>${u.role}</td>
            <td>
                <button class="btn outline-btn edit-staff-btn" data-id="${u.id}" style="padding: 5px;">Edit</button>
                <button class="btn danger-btn del-staff-btn" data-id="${u.id}" style="padding: 5px;">Delete</button>
            </td>
        `;
        
        tr.querySelector('.edit-staff-btn').addEventListener('click', () => {
            document.getElementById('staff-id').value = u.id;
            document.getElementById('staff-name').value = u.name;
            document.getElementById('staff-username').value = u.username;
            document.getElementById('staff-password').placeholder = "(Leave blank to keep current)";
            
            document.querySelectorAll('.staff-sub-cb').forEach(cb => {
                cb.checked = classSubs.includes(cb.value);
            });
            document.getElementById('cancel-staff-btn').style.display = 'inline-block';
        });
        
        tr.querySelector('.del-staff-btn').addEventListener('click', async () => {
            if(confirm('Delete this user?')) {
                try {
                    await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
                    renderStaffTab();
                } catch(e) {
                    alert('Error deleting user or unauthorized.');
                }
            }
        });
        
        tbody.appendChild(tr);
    });
}

document.getElementById('add-staff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('staff-id').value;
    const name = document.getElementById('staff-name').value;
    const username = document.getElementById('staff-username').value;
    const password = document.getElementById('staff-password').value;
    
    const existingUser = users.find(u => u.id === id);
    const existingSubjects = existingUser ? (existingUser.subjects || []) : [];
    const otherClassSubjects = existingSubjects.filter(s => !s.startsWith(currentClass + ':'));
    
    const currentClassSubjects = [];
    document.querySelectorAll('.staff-sub-cb:checked').forEach(cb => currentClassSubjects.push(`${currentClass}:${cb.value}`));
    
    const subjects = [...otherClassSubjects, ...currentClassSubjects];
    
    if (!id && !password) {
        alert("Password is required for new accounts.");
        return;
    }
    
    try {
        const res = await apiFetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, username, password, subjects })
        });
        
        if (res.ok) {
            document.getElementById('add-staff-form').reset();
            document.getElementById('staff-id').value = '';
            document.getElementById('cancel-staff-btn').style.display = 'none';
            renderStaffTab();
        } else {
            const err = await res.json();
            alert("Error: " + err.error);
        }
    } catch(e) {
        alert("Error saving user");
    }
});

document.getElementById('cancel-staff-btn').addEventListener('click', () => {
    document.getElementById('add-staff-form').reset();
    document.getElementById('staff-id').value = '';
    document.getElementById('cancel-staff-btn').style.display = 'none';
});

// 2. Marks Grid Tab
async function renderMarksTab() {
    await fetchStudents();
    
    const allowedSubjects = currentUser.role === 'teacher' ? 
        (currentUser.subjects || []).filter(s => s.startsWith(currentClass + ':')).map(s => s.split(':')[1]) : 
        subjectsList;
    
    // Generate Headers
    const theadTr = document.getElementById('marks-table-header');
    theadTr.innerHTML = '<th>Student Name</th>';
    allowedSubjects.forEach(sub => {
        theadTr.innerHTML += `<th>${sub}</th>`;
    });
    theadTr.innerHTML += `<th>Actions</th>`;

    const tbody = document.querySelector('#marks-entry-table tbody');
    tbody.innerHTML = '';
    
    const classStudents = students.filter(s => (s.classLevel || 'Form 1') === currentClass);
    
    classStudents.forEach(student => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', student.id);
        
        let cols = `<td><strong>${student.name}</strong></td>`;
        
        allowedSubjects.forEach(sub => {
            const isTaking = student.subjects[sub];
            const mark = isTaking && student.marks[sub] !== undefined && student.marks[sub] !== null ? student.marks[sub] : '';
            cols += `
                <td>
                    <input type="number" min="0" max="100" 
                           data-student-id="${student.id}" 
                           data-subject="${sub}" 
                           value="${mark}" 
                           ${isTaking ? '' : 'disabled'}
                           style="width: 60px;">
                </td>
            `;
        });
        
        cols += `
            <td>
                <button class="btn success-btn save-marks-row-btn" data-student-id="${student.id}">Save</button>
            </td>
        `;
        
        tr.innerHTML = cols;
        tbody.appendChild(tr);
    });

    // Add listeners to Save buttons
    tbody.querySelectorAll('.save-marks-row-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const studentId = btn.getAttribute('data-student-id');
            const rowInputs = tbody.querySelectorAll(`input[data-student-id="${studentId}"]`);
            const marks = {};
            rowInputs.forEach(input => {
                const subject = input.getAttribute('data-subject');
                if (!input.disabled) {
                    marks[subject] = input.value !== '' ? Number(input.value) : '';
                }
            });

            try {
                const res = await apiFetch('/api/marks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: studentId, marks })
                });

                if (res.ok) {
                    alert('Marks saved for this row!');
                } else {
                    const errorData = await res.json();
                    alert("Error: " + (errorData.error || "Failed to save marks."));
                }
            } catch(e) {
                alert("Error saving marks.");
            }
        });
    });
}

// 3. Render Rankings Tab
async function renderRankingsTab() {
    await fetchStudents();
    const tbody = document.querySelector('#rankings-table tbody');
    tbody.innerHTML = '';

    const classStudents = students.filter(s => (s.classLevel || 'Form 1') === currentClass);

    classStudents.forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${student.rank}</strong></td>
            <td>${student.name}</td>
            <td>${student.subjectsCount} Subjects</td>
            <td>${student.mscePoints}</td>
            <td>
                <button class="btn primary-btn download-pdf-btn" data-student-id="${student.id}">Save PDF</button>
                <button class="btn outline-btn preview-pdf-btn" data-student-id="${student.id}" style="border: 1px solid var(--primary-color); color: var(--primary-color); background: transparent;">Preview</button>
                <button class="btn success-btn send-wa-btn" data-student-id="${student.id}">WhatsApp Report</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.download-pdf-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const studentId = btn.getAttribute('data-student-id');
            btn.innerText = 'Creating...';
            const res = await apiFetch(`/api/generate-pdf/${studentId}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                btn.innerText = 'Report Generated!';
                alert(`PDF Generated successfully as: ${data.fileName} in server reports folder.`);
                setTimeout(() => btn.innerText = 'Save PDF', 2000);
            } else {
                alert('Error generating PDF.');
                btn.innerText = 'Save PDF';
            }
        });
    });

    tbody.querySelectorAll('.preview-pdf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const studentId = btn.getAttribute('data-student-id');
            window.open(`/api/preview-pdf/${studentId}?token=${authToken}&t=${Date.now()}`, '_blank');
        });
    });

    tbody.querySelectorAll('.send-wa-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const studentId = btn.getAttribute('data-student-id');
            btn.innerText = 'Sending...';
            const res = await apiFetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId })
            });
            if (res.ok) {
                btn.innerText = 'Sent!';
                alert('Progress Report Card successfully sent to WhatsApp!');
            } else {
                const err = await res.json();
                alert(`WhatsApp Send failed: ${err.error}`);
                btn.innerText = 'WhatsApp Report';
            }
        });
    });
}

// 4. WhatsApp Status & Bulk Actions
let statusInterval = null;
function setupWhatsAppStatusPolling() {
    if (statusInterval) clearInterval(statusInterval);
    
    const checkStatus = async () => {
        const res = await apiFetch('/api/whatsapp/status');
        const data = await res.json();
        
        const statusSpan = document.getElementById('whatsapp-status');
        statusSpan.innerText = data.status;
        
        if (data.status === "Connected") {
            statusSpan.className = "statusConnected";
            document.getElementById('qr-image').style.display = 'none';
            document.getElementById('qr-placeholder').style.display = 'block';
            document.getElementById('qr-placeholder').innerText = "✅ WhatsApp Connected!";
        } else if (data.status === "Scan QR Code" && data.qr) {
            statusSpan.className = "statusPending";
            document.getElementById('qr-image').style.display = 'block';
            document.getElementById('qr-image').src = data.qr;
            document.getElementById('qr-placeholder').style.display = 'none';
        } else {
            statusSpan.className = "statusDisconnected";
            document.getElementById('qr-image').style.display = 'none';
            document.getElementById('qr-placeholder').style.display = 'block';
            document.getElementById('qr-placeholder').innerText = "Waiting for WhatsApp connection setup...";
        }
    };
    
    checkStatus();
    statusInterval = setInterval(checkStatus, 3000);
}

// Bulk Send Report Cards
document.getElementById('send-all-btn').addEventListener('click', async () => {
    await fetchStudents();
    if (students.length === 0) {
        alert('No registered students found.');
        return;
    }

    const progressBox = document.getElementById('bulk-progress-box');
    const progressFill = document.getElementById('bulk-progress-fill');
    const progressText = document.getElementById('bulk-progress-text');

    progressBox.style.display = 'block';
    progressFill.style.style = '0%';
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        progressText.innerText = `Sending report for ${s.name} (${i + 1}/${students.length})...`;
        
        const res = await apiFetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: s.id })
        });

        if (res.ok) {
            successCount++;
        } else {
            failCount++;
        }

        const percentage = Math.round(((i + 1) / students.length) * 100);
        progressFill.style.width = `${percentage}%`;

        // Wait a short delay between sends to prevent anti-spam trigger (e.g. 4 seconds)
        await new Promise(resolve => setTimeout(resolve, 4000));
    }

    progressText.innerText = `Completed bulk send! Success: ${successCount}, Failed: ${failCount}`;
});

// 5. Settings Tab
async function loadSettings() {
    const res = await apiFetch('/api/settings');
    const settings = await res.json();
    
    document.getElementById('school-name').value = settings.schoolName || '';
    document.getElementById('school-subtitle').value = settings.subtitle || '';
    document.getElementById('theme-color').value = settings.themeColor || '#142e5c';
    
    if (document.getElementById('headteacher-remarks-pass')) {
        document.getElementById('headteacher-remarks-pass').value = settings.headteacherRemarksPass || '';
        document.getElementById('headteacher-remarks-fail').value = settings.headteacherRemarksFail || '';
        document.getElementById('next-term-fees').value = settings.nextTermFees || '';
        document.getElementById('next-term-date').value = settings.nextTermDate || '';
        
        if (document.getElementById('current-term')) {
            document.getElementById('current-term').value = settings.currentTerm || 'Term One';
            document.getElementById('header-contact-label').value = settings.headerContactLabel || 'School Phone';
            document.getElementById('header-contact-number').value = settings.headerContactNumber || '';
        }
    }
    
    document.getElementById('grading-tbody').innerHTML = '';
    if (settings.gradingSystem) {
        settings.gradingSystem.sort((a,b) => b.min - a.min).forEach(rule => addGradingRow(rule));
    }
    
    document.getElementById('grading-junior-tbody').innerHTML = '';
    if (settings.gradingSystemJunior) {
        settings.gradingSystemJunior.sort((a,b) => b.min - a.min).forEach(rule => addJuniorGradingRow(rule));
    }
    
    const mtbody = document.getElementById('master-subjects-tbody');
    if (mtbody) {
        mtbody.innerHTML = '';
        (settings.masterSubjects || []).forEach(sub => addMasterSubjectRow(sub));
    }
}

function addMasterSubjectRow(sub = {name: '', abbr: '', active: true}) {
    const tbody = document.getElementById('master-subjects-tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="checkbox" class="s-active" ${sub.active ? 'checked' : ''}></td>
        <td><input type="text" class="s-name" value="${sub.name}" required style="width: 150px;"></td>
        <td><input type="text" class="s-abbr" value="${sub.abbr}" required style="width: 80px;"></td>
        <td><button type="button" class="btn danger-btn remove-subject-btn" style="padding:5px;">Remove</button></td>
    `;
    tr.querySelector('.remove-subject-btn').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
}

const addSubBtn = document.getElementById('add-subject-btn');
if (addSubBtn) addSubBtn.addEventListener('click', () => addMasterSubjectRow());

function addGradingRow(rule = {min: '', points: '', remark: ''}) {
    const tbody = document.getElementById('grading-tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" name="minMarks[]" value="${rule.min}" required style="width: 80px;"></td>
        <td><input type="number" name="points[]" value="${rule.points}" required style="width: 80px;"></td>
        <td><input type="text" name="remark[]" value="${rule.remark}" required style="width: 150px;"></td>
        <td><button type="button" class="btn danger-btn remove-grade-btn" style="padding:5px;">Remove</button></td>
    `;
    tr.querySelector('.remove-grade-btn').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
}

function addJuniorGradingRow(rule = {min: '', gradeLetter: '', remark: ''}) {
    const tbody = document.getElementById('grading-junior-tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" name="jMinMarks[]" value="${rule.min}" required style="width: 80px;"></td>
        <td><input type="text" name="jGrade[]" value="${rule.gradeLetter}" required style="width: 80px;"></td>
        <td><input type="text" name="jRemark[]" value="${rule.remark}" required style="width: 150px;"></td>
        <td><button type="button" class="btn danger-btn remove-grade-btn" style="padding:5px;">Remove</button></td>
    `;
    tr.querySelector('.remove-grade-btn').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
}

document.getElementById('add-grade-rule-btn').addEventListener('click', () => addGradingRow());
document.getElementById('add-junior-grade-rule-btn').addEventListener('click', () => addJuniorGradingRow());

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const rules = [];
    document.querySelectorAll('#grading-tbody tr').forEach(tr => {
        rules.push({
            min: Number(tr.querySelector('input[name="minMarks[]"]').value),
            points: Number(tr.querySelector('input[name="points[]"]').value),
            remark: tr.querySelector('input[name="remark[]"]').value
        });
    });
    formData.append('gradingSystem', JSON.stringify(rules));
    
    const jRules = [];
    document.querySelectorAll('#grading-junior-tbody tr').forEach(tr => {
        jRules.push({
            min: Number(tr.querySelector('input[name="jMinMarks[]"]').value),
            gradeLetter: tr.querySelector('input[name="jGrade[]"]').value,
            remark: tr.querySelector('input[name="jRemark[]"]').value
        });
    });
    formData.append('gradingSystemJunior', JSON.stringify(jRules));
    
    const mSubjects = [];
    document.querySelectorAll('#master-subjects-tbody tr').forEach(tr => {
        mSubjects.push({
            active: tr.querySelector('.s-active').checked,
            name: tr.querySelector('.s-name').value,
            abbr: tr.querySelector('.s-abbr').value
        });
    });
    formData.append('masterSubjects', JSON.stringify(mSubjects));
    
    try {
        const res = await apiFetch('/api/settings', {
            method: 'POST',
            body: formData // no Content-Type header so browser sets it automatically with boundary
        });
        
        if (res.ok) {
            alert('Settings saved successfully!');
            document.getElementById('school-logo').value = '';
            await loadGlobals();
        }
    } catch(e) {
        alert('Error saving settings.');
    }
});

document.getElementById('preview-design-btn').addEventListener('click', () => {
    window.open(`/api/preview-pdf/dummy?token=${authToken}&t=${Date.now()}`, '_blank');
});

// Initial load
checkLogin();
