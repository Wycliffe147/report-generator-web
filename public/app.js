let students = [];
const subjectsList = ["AGR", "BK", "BIO", "CHEM", "CHICH", "COMP", "ENG", "GEO", "HIST", "PHY", "MATH", "SOS"];

// Handle Tabs Routing
document.querySelectorAll('.nav-links li').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        
        item.classList.add('active');
        const targetTab = item.getAttribute('data-tab');
        document.getElementById(targetTab).classList.add('active');
        
        if (targetTab === 'students-tab') renderStudentsTab();
        if (targetTab === 'marks-tab') renderMarksTab();
        if (targetTab === 'rankings-tab') renderRankingsTab();
        if (targetTab === 'whatsapp-tab') setupWhatsAppStatusPolling();
        if (targetTab === 'settings-tab') loadSettings();
    });
});

async function fetchStudents() {
    const res = await fetch('/api/students');
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
        await fetch('/api/students', {
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
    
    const res = await fetch('/api/students', {
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

// 2. Render Marks Tab
async function renderMarksTab() {
    await fetchStudents();
    const tbody = document.querySelector('#marks-entry-table tbody');
    tbody.innerHTML = '';

    students.forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${student.name}</strong></td>` +
            subjectsList.map(sub => {
                const isTaking = student.subjects[sub];
                const mark = isTaking && student.marks[sub] !== undefined && student.marks[sub] !== null ? student.marks[sub] : '';
                return `
                    <td>
                        <input type="number" min="0" max="100" 
                               data-student-id="${student.id}" 
                               data-subject="${sub}" 
                               value="${mark}" 
                               ${isTaking ? '' : 'disabled'}>
                    </td>
                `;
            }).join('') +
            `<td>
                <button class="btn success-btn save-marks-row-btn" data-student-id="${student.id}">Save</button>
             </td>`;
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

            const res = await fetch('/api/marks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: studentId, marks })
            });

            if (res.ok) {
                alert('Marks saved for this row!');
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
            const res = await fetch(`/api/generate-pdf/${studentId}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                btn.innerText = 'Report Generated!';
                alert(`PDF Generated successfully as: ${data.fileName} in server reports folder.`);
            } else {
                alert('Error generating PDF.');
                btn.innerText = 'Generate Report';
            }
        });
    });

    tbody.querySelectorAll('.preview-pdf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const studentId = btn.getAttribute('data-student-id');
            window.open(`/api/preview-pdf/${studentId}?t=${Date.now()}`, '_blank');
        });
    });

    tbody.querySelectorAll('.send-wa-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const studentId = btn.getAttribute('data-student-id');
            btn.innerText = 'Sending...';
            const res = await fetch('/api/whatsapp/send', {
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
        const res = await fetch('/api/whatsapp/status');
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
        
        const res = await fetch('/api/whatsapp/send', {
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
    const res = await fetch('/api/settings');
    const settings = await res.json();
    
    document.getElementById('school-name').value = settings.schoolName || '';
    document.getElementById('school-subtitle').value = settings.subtitle || '';
    document.getElementById('theme-color').value = settings.themeColor || '#142e5c';
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const res = await fetch('/api/settings', {
        method: 'POST',
        body: formData // no Content-Type header so browser sets it automatically with boundary
    });
    
    if (res.ok) {
        alert('Settings saved successfully! The PDF layout has been updated.');
        document.getElementById('school-logo').value = ''; // clear file input
    } else {
        alert('Error saving settings.');
    }
});

document.getElementById('preview-design-btn').addEventListener('click', () => {
    window.open('/api/preview-pdf/dummy?t=' + Date.now(), '_blank');
});

// Initial load
renderStudentsTab();
