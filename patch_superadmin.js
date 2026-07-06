const fs = require('fs');

// Patch index.html
let html = fs.readFileSync('public/index.html', 'utf8');
if (!html.includes('data-tab="superadmin-tab"')) {
    html = html.replace('<li data-tab="settings-tab">Settings</li>', '<li data-tab="settings-tab">Settings</li>\n                <li data-tab="superadmin-tab" id="nav-superadmin" style="display:none; color: var(--accent-success); font-weight: bold;">Super Admin</li>');
    
    const superAdminSection = `
            <!-- 7. Super Admin Tab -->
            <section id="superadmin-tab" class="tab-panel">
                <div class="panel-header" style="background-color: var(--accent-success);">
                    <h1>Super Admin Dashboard</h1>
                </div>
                <div class="card full-width-card">
                    <h3>SaaS Tenants (Schools)</h3>
                    <p class="subtitle">Manage subscriptions and schools here.</p>
                    <div class="table-container" style="margin-top: 15px;">
                        <table id="saas-schools-table">
                            <thead>
                                <tr>
                                    <th>School ID</th>
                                    <th>School Name</th>
                                    <th>Students</th>
                                    <th>Admin Users</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Rendered dynamically -->
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="card" style="margin-top: 20px;">
                    <h3>Register New School</h3>
                    <p class="subtitle">Create a new isolated school tenant.</p>
                    <form id="new-school-form" style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px; max-width: 400px;">
                        <div>
                            <label>School Name</label>
                            <input type="text" id="new-school-name" required>
                        </div>
                        <div>
                            <label>Admin Username</label>
                            <input type="text" id="new-school-admin" required>
                        </div>
                        <div>
                            <label>Admin Password</label>
                            <input type="password" id="new-school-pass" required>
                        </div>
                        <button type="submit" class="btn primary-btn" style="background-color: var(--accent-success);">Create School</button>
                    </form>
                </div>
            </section>
        </main>`;
    
    html = html.replace('</main>', superAdminSection);
    fs.writeFileSync('public/index.html', html);
}

// Patch app.js
let js = fs.readFileSync('public/app.js', 'utf8');
if (!js.includes('function renderSuperAdmin')) {
    const superAdminJs = `
// Super Admin Logic
async function loadSuperAdmin() {
    try {
        const res = await apiFetch('/api/saas/schools');
        if (!res.ok) return; // Not a superadmin
        const schools = await res.json();
        
        const tbody = document.querySelector('#saas-schools-table tbody');
        tbody.innerHTML = '';
        schools.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = \`
                <td>\${s.schoolId}</td>
                <td><strong>\${s.schoolName}</strong></td>
                <td>\${s.studentCount}</td>
                <td>\${s.adminUsers.join(', ')}</td>
            \`;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.log("Not a superadmin", e);
    }
}

document.getElementById('new-school-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const schoolName = document.getElementById('new-school-name').value;
    const adminUsername = document.getElementById('new-school-admin').value;
    const adminPassword = document.getElementById('new-school-pass').value;
    
    try {
        const res = await apiFetch('/api/saas/schools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schoolName, adminUsername, adminPassword })
        });
        
        const data = await res.json();
        if (data.error) return alert(data.error);
        
        alert('School created successfully! ID: ' + data.schoolId);
        document.getElementById('new-school-form').reset();
        loadSuperAdmin();
    } catch (e) {
        alert("Failed to create school.");
    }
});

// Hook into header to show Super Admin tab if applicable
const oldRenderHeader = renderHeader;
renderHeader = function() {
    oldRenderHeader();
    if (currentUser && currentUser.role === 'superadmin') {
        const navSuper = document.getElementById('nav-superadmin');
        if (navSuper) navSuper.style.display = 'block';
    }
};
`;
    js = js.replace('document.addEventListener("DOMContentLoaded", () => {', superAdminJs + '\n\ndocument.addEventListener("DOMContentLoaded", () => {');
    
    // Add loadSuperAdmin to tab switching
    js = js.replace("loadSettings();", "loadSettings();\n        } else if (tabId === 'superadmin-tab') {\n            loadSuperAdmin();");
    fs.writeFileSync('public/app.js', js);
}
console.log("Patched UI for Super Admin");
