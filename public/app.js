let students = [];
const subjectsList = ["AGR", "BK", "BIO", "CHEM", "CHICH", "COMP", "ENG", "GEO", "HIST", "PHY", "MATH", "SOS"];

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

function checkLogin() {
    if (authToken && currentUser) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        document.getElementById('user-greeting').innerText = `Welcome, ${currentUser.name}`;
        
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
    const tbody = document.querySelector('#subjects-table tbody');
    tbody.innerHTML = '';
    
    students.forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${student.name}</strong><br><small>${student.phone}</small></td>` + 
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

    for (const studentId of Object.keys(updates)) {
        const student = students.find(s => s.id === studentId);
        await apiFetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: studentId,
                name: student.name,
                phone: student.phone,
                subjects: updates[studentId].subjects
            })
        });
    }
    alert('Subject selections saved successfully!');
    renderStudentsTab();
});

// Add New Student Form
document.getElementById('add-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('student-name').value;
    const phone = document.getElementById('student-phone').value;
    
    const res = await apiFetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, subjects: {} })
    });
    
    if (res.ok) {
        document.getElementById('student-name').value = '';
        document.getElementById('student-phone').value = '';
        alert('Student registered!');
        renderStudentsTab();
    }
});

// Search Student
document.getElementById('student-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#subjects-table tbody tr').forEach(tr => {
        const name = tr.querySelector('td').innerText.toLowerCase();
        if (name.includes(term)) {
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
        tr.innerHTML = `
            <td>${u.name}</td>
            <td>${u.username}</td>
            <td>${u.role === 'admin' ? 'ALL' : u.subjects.join(', ') || 'None'}</td>
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
                cb.checked = u.subjects.includes(cb.value);
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
    
    const subjects = [];
    document.querySelectorAll('.staff-sub-cb:checked').forEach(cb => subjects.push(cb.value));
    
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
    
    const allowedSubjects = currentUser.role === 'teacher' ? currentUser.subjects : subjectsList;
    
    // Generate Headers
    const theadTr = document.getElementById('marks-table-header');
    theadTr.innerHTML = '<th>Student Name</th>';
    allowedSubjects.forEach(sub => {
        theadTr.innerHTML += `<th>${sub}</th>`;
    });
    theadTr.innerHTML += `<th>Actions</th>`;

    const tbody = document.querySelector('#marks-entry-table tbody');
    tbody.innerHTML = '';
    
    students.forEach(student => {
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

    students.forEach(student => {
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
        document.getElementById('bursary-name').value = settings.bursaryName || '';
        document.getElementById('next-term-fees').value = settings.nextTermFees || '';
        document.getElementById('next-term-date').value = settings.nextTermDate || '';
    }
    
    document.getElementById('grading-tbody').innerHTML = '';
    if (settings.gradingSystem) {
        settings.gradingSystem.sort((a,b) => b.min - a.min).forEach(rule => addGradingRow(rule));
    }
}

function addGradingRow(rule = {min: 0, grade: '', points: 0, remark: ''}) {
    const tbody = document.getElementById('grading-tbody');
    const tr = document.createElement('tr');
    tr.className = 'grading-row';
    tr.innerHTML = `
        <td><input type="number" class="g-min" value="${rule.min}" required style="width: 60px; padding: 5px;"></td>
        <td><input type="text" class="g-grade" value="${rule.grade}" required style="width: 60px; padding: 5px;"></td>
        <td><input type="number" class="g-points" value="${rule.points}" required style="width: 60px; padding: 5px;"></td>
        <td><input type="text" class="g-remark" value="${rule.remark}" required style="width: 100px; padding: 5px;"></td>
        <td><button type="button" class="btn danger-btn remove-rule-btn" style="padding: 5px 10px;">X</button></td>
    `;
    tr.querySelector('.remove-rule-btn').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
}

document.getElementById('add-grade-rule-btn').addEventListener('click', () => addGradingRow());

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const rules = [];
    document.querySelectorAll('.grading-row').forEach(row => {
        rules.push({
            min: Number(row.querySelector('.g-min').value),
            grade: row.querySelector('.g-grade').value,
            points: Number(row.querySelector('.g-points').value),
            remark: row.querySelector('.g-remark').value
        });
    });
    formData.append('gradingSystem', JSON.stringify(rules));
    
    try {
        const res = await apiFetch('/api/settings', {
            method: 'POST',
            body: formData // no Content-Type header so browser sets it automatically with boundary
        });
        
        if (res.ok) {
            alert('Settings saved successfully!');
            document.getElementById('school-logo').value = '';
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
