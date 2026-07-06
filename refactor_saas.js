const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Refactor readDb
code = code.replace(/function readDb\(\) \{[\s\S]*?return db;\n\}/, `function readDb(schoolId = 'default') {
    if (!dbCache.schools) {
        dbCache.schools = {
            'default': {
                students: dbCache.students || [],
                settings: dbCache.settings || {},
                subjects: dbCache.subjects || []
            }
        };
        dbCache.users = dbCache.users || [];
        dbCache.users.forEach(u => { if(!u.schoolId) u.schoolId = 'default'; });
        delete dbCache.students;
        delete dbCache.settings;
        delete dbCache.subjects;
    }
    
    if (!dbCache.schools[schoolId]) {
        dbCache.schools[schoolId] = {
            students: [],
            settings: JSON.parse(JSON.stringify(dbCache.schools['default'].settings)),
            subjects: [...dbCache.schools['default'].subjects]
        };
    }
    
    const schoolData = dbCache.schools[schoolId];
    
    // Default settings per school if missing
    if (schoolData.settings.headteacherRemarksPass === undefined) schoolData.settings.headteacherRemarksPass = "Promoted to next class. Well done!";
    if (schoolData.settings.headteacherRemarksFail === undefined) schoolData.settings.headteacherRemarksFail = "Failed. Work harder next term.";
    if (schoolData.settings.nextTermFees === undefined) schoolData.settings.nextTermFees = "MK 50,000";
    if (schoolData.settings.nextTermDate === undefined) schoolData.settings.nextTermDate = "10 September 2026";
    if (schoolData.settings.currentTerm === undefined) schoolData.settings.currentTerm = "Term One";
    if (!schoolData.settings.gradingSystem) {
        schoolData.settings.gradingSystem = dbCache.schools['default'].settings.gradingSystem || [];
    }
    if (!schoolData.settings.gradingSystemJunior) {
        schoolData.settings.gradingSystemJunior = dbCache.schools['default'].settings.gradingSystemJunior || [];
    }
    if (!schoolData.settings.masterSubjects) {
        schoolData.settings.masterSubjects = dbCache.schools['default'].settings.masterSubjects || [];
    }
    schoolData.subjects = schoolData.settings.masterSubjects.filter(s => s.active).map(s => s.name);
    
    // Inject users into the returned object for compatibility, filtering by schoolId
    schoolData.users = dbCache.users.filter(u => u.schoolId === schoolId || u.role === 'superadmin');
    schoolData.allUsers = dbCache.users; // global reference
    
    return schoolData;
}`);

// 2. Refactor writeDb
code = code.replace(/function writeDb\(db\) \{[\s\S]*?fs\.writeFileSync.*?;\n\}/, `function writeDb() {
    if (mongoDb) {
        mongoDb.collection('app_state').updateOne(
            { _id: 'main' },
            { $set: { data: dbCache } },
            { upsert: true }
        ).catch(err => console.error("MongoDB Save Error:", err));
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2));
}`);

// 3. Remove arguments from writeDb calls
code = code.replace(/writeDb\(db\);/g, "writeDb();");
code = code.replace(/writeDb\(schoolData\);/g, "writeDb();");

// 4. Update endpoints to use schoolId
code = code.replace(/const db = readDb\(\);/g, "const db = readDb(req.user ? req.user.schoolId : 'default');");

// 5. Fix Login route which doesn't have req.user yet
code = code.replace(/app\.post\('\/api\/login', \(req, res\) => \{\n\s+const db = readDb\(req\.user \? req\.user\.schoolId : 'default'\);/g, 
`app.post('/api/login', (req, res) => {
    // Force readDb to initialize structure
    readDb('default');
    const { username, password } = req.body;
    const user = dbCache.users.find(u => u.username === username);`);

// 6. Fix token sign payload to include schoolId
code = code.replace(/const token = jwt\.sign\(\{ id: user\.id, username: user\.username, role: user\.role, subjects: user\.subjects, name: user\.name \}, JWT_SECRET, \{ expiresIn: '24h' \}\);/g,
`const token = jwt.sign({ id: user.id, username: user.username, role: user.role, subjects: user.subjects, name: user.name, schoolId: user.schoolId || 'default' }, JWT_SECRET, { expiresIn: '24h' });`);

// 7. Fix User Registration to attach schoolId
code = code.replace(/db\.users\.push\(\{/g, `dbCache.users.push({ schoolId: req.user ? req.user.schoolId : 'default',`);
code = code.replace(/const existingUser = db\.users\.find/g, `const existingUser = dbCache.users.find`);
code = code.replace(/db\.users = db\.users\.filter/g, `dbCache.users = dbCache.users.filter`);

fs.writeFileSync('server.js', code);
console.log("Refactored server.js for Multi-Tenancy!");
