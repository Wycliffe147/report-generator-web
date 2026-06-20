const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super-secret-excel-academy-key-change-me';

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const REPORTS_DIR = path.join(__dirname, 'reports');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const upload = multer({ dest: UPLOADS_DIR });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Initialize Database
if (!fs.existsSync(DB_FILE)) {
    const initialDb = {
        students: [],
        subjects: [
            "Additional Mathematics", "Agriculture", "Biology", "Bible Knowledge", 
            "Business Studies", "Computer Studies", "Chemistry", "Chichewa", 
            "Clothing & Textiles", "Creative Arts", "Geography", "French", 
            "English", "History", "Home Economics", "Life Skills", 
            "Mathematics", "Metal Work", "Physics", "Religious & Moral Education", 
            "Social Studies", "Technical Drawing", "Woodwork"
        ],
        settings: {
            schoolName: "EXCEL ACADEMY",
            subtitle: "Official Student Progress Report Card",
            themeColor: "#142e5c",
            logoPath: null
        }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
}

function readDb() {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    
    if (!db.settings) {
        db.settings = {
            schoolName: "EXCEL ACADEMY",
            subtitle: "Official Student Progress Report Card",
            themeColor: "#142e5c",
            logoPath: null
        };
    }
    if (!db.settings.gradingSystem) {
        db.settings.gradingSystem = [
            { min: 80, points: 1, remark: "Distinction" },
            { min: 75, points: 2, remark: "Distinction" },
            { min: 70, points: 3, remark: "Credit" },
            { min: 65, points: 4, remark: "Credit" },
            { min: 60, points: 5, remark: "Credit" },
            { min: 50, points: 6, remark: "Credit" },
            { min: 45, points: 7, remark: "Pass" },
            { min: 40, points: 8, remark: "Pass" },
            { min: 0, points: 9, remark: "Fail" }
        ];
    }
    if (!db.settings.gradingSystemJunior) {
        db.settings.gradingSystemJunior = [
            { min: 75, gradeLetter: "A", remark: "Distinction" },
            { min: 60, gradeLetter: "B", remark: "Credit" },
            { min: 45, gradeLetter: "C", remark: "Pass" },
            { min: 30, gradeLetter: "D", remark: "Pass" },
            { min: 0, gradeLetter: "F", remark: "Fail" }
        ];
    }
    if (!db.users) {
        db.users = [{
            id: 'admin_1',
            username: 'admin',
            name: 'System Admin',
            passwordHash: bcrypt.hashSync('password', 8),
            role: 'admin',
            subjects: []
        }];
    }
    
    // Default new fields if missing
    if (db.settings.headteacherRemarksPass === undefined) db.settings.headteacherRemarksPass = "Promoted to next class. Well done!";
    if (db.settings.headteacherRemarksFail === undefined) db.settings.headteacherRemarksFail = "Failed. Work harder next term.";
    if (db.settings.nextTermFees === undefined) db.settings.nextTermFees = "MK 50,000";
    if (db.settings.nextTermDate === undefined) db.settings.nextTermDate = "10 September 2026";
    if (db.settings.currentTerm === undefined) db.settings.currentTerm = "Term One";
    if (db.settings.headerContactLabel === undefined) db.settings.headerContactLabel = "School Phone";
    if (db.settings.headerContactNumber === undefined) db.settings.headerContactNumber = "0999000000";
    
    if (!db.settings.masterSubjects) {
        db.settings.masterSubjects = [
            { name: "Additional Mathematics", abbr: "ADD", active: true },
            { name: "Agriculture", abbr: "AGR", active: true },
            { name: "Biology", abbr: "BIO", active: true },
            { name: "Bible Knowledge", abbr: "BK", active: true },
            { name: "Business Studies", abbr: "BUS", active: true },
            { name: "Computer Studies", abbr: "Comp", active: true },
            { name: "Chemistry", abbr: "CHEM", active: true },
            { name: "Chichewa", abbr: "CHIC", active: true },
            { name: "Clothing & Textiles", abbr: "C&T", active: true },
            { name: "Creative Arts", abbr: "ART", active: true },
            { name: "Geography", abbr: "GEO", active: true },
            { name: "French", abbr: "FRE", active: true },
            { name: "English", abbr: "ENG", active: true },
            { name: "History", abbr: "HIST", active: true },
            { name: "Home Economics", abbr: "HEC", active: true },
            { name: "Life Skills", abbr: "LIFE", active: true },
            { name: "Mathematics", abbr: "MATH", active: true },
            { name: "Metal Work", abbr: "MET", active: true },
            { name: "Physics", abbr: "PHY", active: true },
            { name: "Religious & Moral Education", abbr: "RME", active: true },
            { name: "Social Studies", abbr: "SOS", active: true },
            { name: "Technical Drawing", abbr: "TD", active: true },
            { name: "Woodwork", abbr: "WOOD", active: true }
        ];
    }
    
    // Always sync db.subjects with masterSubjects
    db.subjects = db.settings.masterSubjects.filter(s => s.active).map(s => s.name);
    
    writeDb(db);
    return db;
}

function writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Calculate Grades
function getGrade(scoreStr, db, classLevel) {
    const isJunior = classLevel === 'Form 1' || classLevel === 'Form 2';
    
    if (scoreStr === '' || scoreStr === null || scoreStr === undefined) {
        return isJunior ? { gradeLetter: '-', remark: 'No Grade', points: '-' } : { points: 9, remark: 'No Grade', gradeLetter: '-' };
    }
    
    const score = Number(scoreStr);
    
    if (isJunior) {
        const rules = [...(db.settings.gradingSystemJunior || [])].sort((a, b) => b.min - a.min);
        for (const rule of rules) {
            if (score >= rule.min) return { gradeLetter: rule.gradeLetter, remark: rule.remark, points: '-' };
        }
        return { gradeLetter: 'F', remark: "Fail", points: '-' };
    } else {
        const rules = [...(db.settings.gradingSystem || [])].sort((a, b) => b.min - a.min);
        for (const rule of rules) {
            if (score >= rule.min) return { points: rule.points, remark: rule.remark, gradeLetter: '-' };
        }
        return { points: 9, remark: "Fail", gradeLetter: '-' };
    }
}

// Calculate Student Rankings
function rankStudents(db) {
    const forms = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
    
    forms.forEach(form => {
        const classStudents = db.students.filter(s => (s.classLevel || 'Form 1') === form);
        
        classStudents.forEach(student => {
            student.mscePoints = 0;
            student.subjectsCount = 0;
            let pointsList = [];
            
            db.subjects.forEach(sub => {
                if (student.subjects && student.subjects[sub]) {
                    student.subjectsCount++;
                    const score = student.marks && student.marks[sub];
                    if (score !== null && score !== undefined && score !== '') {
                        const gradeInfo = getGrade(score, db, student.classLevel || 'Form 1');
                        if (!['Form 1', 'Form 2'].includes(student.classLevel || 'Form 1')) {
                            if (gradeInfo.points !== '-') {
                                pointsList.push(Number(gradeInfo.points));
                            }
                        } else {
                            // Junior grading: for ranking, maybe we count passes?
                            // For simplicity, juniors might just use total score or we convert grades to points implicitly.
                            // Let's use total average score for junior rankings to be fair.
                            pointsList.push(100 - Number(score)); // Reverse so lowest "points" is best, like MSCE!
                        }
                    }
                }
            });
            
            pointsList.sort((a, b) => a - b);
            const best6 = pointsList.slice(0, 6);
            student.mscePoints = best6.reduce((acc, val) => acc + val, 0);
            
            // For juniors, mscePoints is actually the inverted top 6 scores.
            // Let's store raw total score for juniors to display properly.
            if (['Form 1', 'Form 2'].includes(student.classLevel || 'Form 1')) {
                student.juniorTotalScore = pointsList.reduce((acc, val) => acc + (100 - val), 0); 
            }
        });
        
        // Sort students within the class
        classStudents.sort((a, b) => {
            const isJunior = ['Form 1', 'Form 2'].includes(a.classLevel || 'Form 1');
            if (isJunior) {
                return (b.juniorTotalScore || 0) - (a.juniorTotalScore || 0); // Highest total score first
            } else {
                return a.mscePoints - b.mscePoints; // Lowest points first
            }
        });
        
        classStudents.forEach((student, index) => {
            student.rank = index + 1;
        });
    });
}

// API Routes

app.post('/api/login', (req, res) => {
    const db = readDb();
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, subjects: user.subjects, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, subjects: user.subjects, name: user.name } });
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    if (!token && req.query.token) token = req.query.token;
    if (!token) return res.status(401).json({ error: "Access denied" });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    next();
}

app.use('/api', authenticateToken);

app.get('/api/me', (req, res) => {
    res.json({ user: req.user });
});

app.get('/api/settings', (req, res) => {
    res.json(readDb().settings);
});

app.post('/api/settings', requireAdmin, upload.single('logo'), (req, res) => {
    const db = readDb();
    if (req.body.schoolName) db.settings.schoolName = req.body.schoolName;
    if (req.body.subtitle) db.settings.subtitle = req.body.subtitle;
    if (req.body.themeColor) db.settings.themeColor = req.body.themeColor;
    if (req.body.headteacherRemarksPass !== undefined) db.settings.headteacherRemarksPass = req.body.headteacherRemarksPass;
    if (req.body.headteacherRemarksFail !== undefined) db.settings.headteacherRemarksFail = req.body.headteacherRemarksFail;
    if (req.body.nextTermFees !== undefined) db.settings.nextTermFees = req.body.nextTermFees;
    if (req.body.nextTermDate !== undefined) db.settings.nextTermDate = req.body.nextTermDate;
    if (req.body.currentTerm !== undefined) db.settings.currentTerm = req.body.currentTerm;
    if (req.body.headerContactLabel !== undefined) db.settings.headerContactLabel = req.body.headerContactLabel;
    if (req.body.headerContactNumber !== undefined) db.settings.headerContactNumber = req.body.headerContactNumber;
    
    if (req.body.masterSubjects) {
        try {
            const parsed = JSON.parse(req.body.masterSubjects);
            db.settings.masterSubjects = parsed;
            db.subjects = parsed.filter(s => s.active).map(s => s.name);
        } catch (e) {
            console.error("Error parsing masterSubjects", e);
        }
    }
    
    if (req.body.gradingSystem) {
        try {
            db.settings.gradingSystem = JSON.parse(req.body.gradingSystem);
        } catch (e) {
            console.error("Error parsing gradingSystem", e);
        }
    }
    
    if (req.body.gradingSystemJunior) {
        try {
            db.settings.gradingSystemJunior = JSON.parse(req.body.gradingSystemJunior);
        } catch (e) {
            console.error("Error parsing gradingSystemJunior", e);
        }
    }
    
    if (req.file) {
        db.settings.logoPath = req.file.path;
    }
    
    writeDb(db);
    res.json({ success: true, settings: db.settings });
});

app.get('/api/users', requireAdmin, (req, res) => {
    const db = readDb();
    const safeUsers = db.users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, subjects: u.subjects }));
    res.json(safeUsers);
});

app.post('/api/users', requireAdmin, (req, res) => {
    const db = readDb();
    const { id, username, name, password, subjects } = req.body;
    
    if (id) {
        const idx = db.users.findIndex(u => u.id === id);
        if (idx !== -1) {
            db.users[idx].username = username;
            db.users[idx].name = name;
            db.users[idx].subjects = subjects || [];
            if (password) {
                db.users[idx].passwordHash = bcrypt.hashSync(password, 8);
            }
        }
    } else {
        if (db.users.find(u => u.username === username)) {
            return res.status(400).json({ error: "Username already exists" });
        }
        db.users.push({
            id: 'teacher_' + Date.now(),
            username,
            name,
            passwordHash: bcrypt.hashSync(password, 8),
            role: 'teacher',
            subjects: subjects || []
        });
    }
    writeDb(db);
    res.json({ success: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const db = readDb();
    if (req.params.id === 'admin_1' || req.params.id === req.user.id) {
        return res.status(400).json({ error: "Cannot delete master admin or yourself." });
    }
    db.users = db.users.filter(u => u.id !== req.params.id);
    writeDb(db);
    res.json({ success: true });
});

app.get('/api/students', (req, res) => {
    const db = readDb();
    rankStudents(db);
    let ranked = db.students;
    if (req.user.role !== 'admin') {
        const teacherSubjects = req.user.subjects || [];
        ranked = ranked.filter(s => teacherSubjects.some(sub => s.subjects[sub]));
    }
    res.json(ranked);
});

app.post('/api/students', requireAdmin, (req, res) => {
    const db = readDb();
    
    // Bulk update from table
    if (req.body.updates) {
        Object.keys(req.body.updates).forEach(id => {
            const student = db.students.find(s => s.id === id);
            if (student) {
                if (req.body.updates[id].name !== undefined) student.name = req.body.updates[id].name;
                if (req.body.updates[id].phone !== undefined) student.phone = req.body.updates[id].phone;
                if (req.body.updates[id].bursaryName !== undefined) student.bursaryName = req.body.updates[id].bursaryName;
                
                if (req.body.updates[id].subjects) {
                    if (!student.subjects) student.subjects = {};
                    Object.assign(student.subjects, req.body.updates[id].subjects);
                }
            }
        });
    } else {
        // Add new student
        db.students.push({
            id: Date.now().toString(),
            name: req.body.name,
            phone: req.body.phone,
            bursaryName: req.body.bursaryName,
            classLevel: req.body.classLevel || 'Form 1',
            subjects: req.body.subjects || {},
            marks: {}
        });
    }
    writeDb(db);
    res.json({ success: true });
});

app.delete('/api/students/:id', requireAdmin, (req, res) => {
    const db = readDb();
    db.students = db.students.filter(s => s.id !== req.params.id);
    writeDb(db);
    res.json({ success: true });
});

app.post('/api/marks', (req, res) => {
    const db = readDb();
    const { id, marks } = req.body;
    
    if (req.user.role !== 'admin') {
        const teacherSubjects = req.user.subjects || [];
        for (let sub of Object.keys(marks)) {
            if (marks[sub] !== undefined && marks[sub] !== '' && !teacherSubjects.includes(sub)) {
                return res.status(403).json({ error: "Unauthorized to edit subject: " + sub });
            }
        }
    }
    
    const idx = db.students.findIndex(s => s.id === id);
    if (idx !== -1) {
        db.subjects.forEach(sub => {
            if (db.students[idx].subjects[sub]) {
                db.students[idx].marks[sub] = marks[sub] !== '' ? Number(marks[sub]) : null;
            }
        });
        writeDb(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Student not found" });
    }
});

// PDF Generation
async function generatePDF(student, db) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
    const { width, height } = page.getSize();
    
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Decorative Header Block
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16) / 255, g: parseInt(result[2], 16) / 255, b: parseInt(result[3], 16) / 255 } : { r: 0.08, g: 0.18, b: 0.36 };
    };
    const theme = hexToRgb(db.settings.themeColor);

    page.drawRectangle({
        x: 0,
        y: height - 100,
        width: width,
        height: 100,
        color: rgb(theme.r, theme.g, theme.b),
    });

    if (db.settings.logoPath && fs.existsSync(db.settings.logoPath)) {
        try {
            const logoBytes = fs.readFileSync(db.settings.logoPath);
            let logoImage;
            
            // Check magic bytes to determine if PNG or JPEG
            const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50 && logoBytes[2] === 0x4E && logoBytes[3] === 0x47;
            
            if (isPng) {
                logoImage = await pdfDoc.embedPng(logoBytes);
            } else {
                // Fallback to JPEG
                logoImage = await pdfDoc.embedJpg(logoBytes);
            }
            
            const targetHeight = 60;
            const scaleFactor = targetHeight / logoImage.height;
            page.drawImage(logoImage, {
                x: width - 40 - (logoImage.width * scaleFactor),
                y: height - 80,
                width: logoImage.width * scaleFactor,
                height: targetHeight,
            });
        } catch (e) {
            console.error("Failed to embed logo:", e);
        }
    }

    page.drawText(db.settings.schoolName, {
        x: 40,
        y: height - 50,
        size: 24,
        font: fontBold,
        color: rgb(1, 1, 1),
    });

    page.drawText(db.settings.subtitle, {
        x: 40,
        y: height - 75,
        size: 12,
        font: fontRegular,
        color: rgb(0.8, 0.85, 0.95),
    });

    const isJunior = ['Form 1', 'Form 2'].includes(student.classLevel || 'Form 1');
    const classTotal = db.students.filter(s => (s.classLevel || 'Form 1') === (student.classLevel || 'Form 1')).length;

    // Student Info Block
    page.drawText(`${db.settings.headerContactLabel}: ${db.settings.headerContactNumber}`, { x: 40, y: height - 120, size: 10, font: fontRegular });
    page.drawText(`Student Name: ${student.name}`, { x: 40, y: height - 140, size: 12, font: fontBold });
    page.drawText(`Class: ${student.classLevel || 'Form 1'}`, { x: 40, y: height - 160, size: 10, font: fontBold });
    page.drawText(`Term: ${db.settings.currentTerm}`, { x: 40, y: height - 180, size: 10, font: fontBold });
    
    const totalText = isJunior ? `Total Score: ${student.juniorTotalScore}` : `Total Points: ${student.mscePoints} (Best 6 Subjects)`;
    page.drawText(`Position: ${student.rank} of ${classTotal}`, { x: 380, y: height - 140, size: 12, font: fontBold });
    page.drawText(totalText, { x: 380, y: height - 160, size: 10, font: fontRegular });

    // Table Header
    const columns = [
        { title: 'Subject', x: 40 },
        { title: 'Score (%)', x: 170 },
        { title: isJunior ? 'Grade' : 'Points', x: 250 },
        { title: 'Remark', x: 330 },
        { title: 'Teacher', x: 440 }
    ];
    const tableTop = height - 220;
    page.drawLine({ start: { x: 40, y: tableTop }, end: { x: 550, y: tableTop }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
    
    columns.forEach(col => {
        page.drawText(col.title, { x: col.x, y: tableTop - 20, size: 10, font: fontBold });
    });
    
    page.drawLine({ start: { x: 40, y: tableTop - 30 }, end: { x: 550, y: tableTop - 30 }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });

    let currentY = tableTop - 50;
    const graphData = [];
    
    db.subjects.forEach(sub => {
        if (student.subjects[sub]) {
            const score = student.marks[sub];
            const hasScore = score !== null && score !== undefined && score !== '';
            
            if (hasScore) {
                graphData.push({ subject: sub, score: Number(score) });
            }
            
            const gradeInfo = hasScore ? getGrade(score, db, student.classLevel || 'Form 1') : { points: '-', remark: 'Absent/No Score', gradeLetter: '-' };

            const teacherSubKey = `${student.classLevel || 'Form 1'}:${sub}`;
            const teachersForSub = db.users
                .filter(u => u.role === 'teacher' && (u.subjects || []).includes(teacherSubKey))
                .map(u => u.name).join(', ');
            const teacherName = teachersForSub || '-';

            page.drawText(sub, { x: columns[0].x, y: currentY, size: 10, font: fontRegular });
            page.drawText(hasScore ? `${score}%` : '-', { x: columns[1].x, y: currentY, size: 10, font: fontRegular });
            page.drawText(isJunior ? gradeInfo.gradeLetter : String(gradeInfo.points), { x: columns[2].x, y: currentY, size: 10, font: fontRegular });
            page.drawText(gradeInfo.remark, { x: columns[3].x, y: currentY, size: 10, font: fontRegular });
            page.drawText(teacherName, { x: columns[4].x, y: currentY, size: 9, font: fontRegular });

            // Light separation line
            page.drawLine({ start: { x: 40, y: currentY - 8 }, end: { x: 550, y: currentY - 8 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
            currentY -= 25;
        }
    });

    // Calculate Pass/Fail Status
    let passedSubjectsCount = 0;
    let englishPassed = false;
    db.subjects.forEach(sub => {
        if (student.subjects[sub]) {
            const score = student.marks[sub];
            if (score !== null && score !== undefined && score !== '') {
                const gradeInfo = getGrade(score, db);
                if (gradeInfo.points !== '-' && Number(gradeInfo.points) < 9) {
                    passedSubjectsCount++;
                    if (sub === 'ENG' || sub === 'English') englishPassed = true;
                }
            }
        }
    });
    
    const hasPassed = englishPassed && passedSubjectsCount >= 6;
    const finalRemarks = hasPassed ? db.settings.headteacherRemarksPass : db.settings.headteacherRemarksFail;

    // --- Bar Graph ---
    if (graphData.length > 0) {
        currentY -= 30; // Space before graph
        const chartHeight = 80;
        const chartWidth = 450;
        const chartY = currentY - chartHeight;
        
        // Draw axes
        page.drawLine({ start: { x: 50, y: chartY }, end: { x: 520, y: chartY }, thickness: 1, color: rgb(0,0,0) }); // X axis
        page.drawLine({ start: { x: 50, y: chartY }, end: { x: 50, y: chartY + chartHeight }, thickness: 1, color: rgb(0,0,0) }); // Y axis
        
        // Y-axis labels
        page.drawText('100', { x: 30, y: chartY + chartHeight - 3, size: 8, font: fontRegular });
        page.drawText('50', { x: 35, y: chartY + (chartHeight/2) - 3, size: 8, font: fontRegular });
        page.drawText('0', { x: 40, y: chartY - 3, size: 8, font: fontRegular });

        // Draw horizontal grid lines
        page.drawLine({ start: { x: 50, y: chartY + (chartHeight/2) }, end: { x: 520, y: chartY + (chartHeight/2) }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        page.drawLine({ start: { x: 50, y: chartY + chartHeight }, end: { x: 520, y: chartY + chartHeight }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

        // Draw bars
        const spacing = chartWidth / graphData.length;
        const barWidth = Math.min(30, spacing - 10);

        graphData.forEach((data, index) => {
            const barHeight = (data.score / 100) * chartHeight;
            const x = 50 + (index * spacing) + (spacing / 2) - (barWidth / 2);
            
            // Bar
            page.drawRectangle({
                x: x,
                y: chartY + 1,
                width: barWidth,
                height: barHeight,
                color: rgb(0.1, 0.3, 0.6)
            });
            
            // Subject Label (centered under bar)
            page.drawText(data.subject, { x: x + (barWidth/2) - (data.subject.length * 2.5), y: chartY - 12, size: 8, font: fontRegular });
            
            // Score Label (centered above bar)
            page.drawText(String(data.score), { x: x + (barWidth/2) - 5, y: chartY + barHeight + 3, size: 8, font: fontRegular });
        });

        currentY = chartY - 30; // Move currentY below the chart
    }

    // Summary Details at Bottom
    currentY -= 10;
    
    page.drawText(`Headteacher's Remarks: ${finalRemarks}`, { x: 40, y: currentY, size: 10, font: fontRegular });
    if (student.bursaryName && student.bursaryName.trim() !== '') {
        currentY -= 15;
        page.drawText(`Bursary Name: ${student.bursaryName}`, { x: 40, y: currentY, size: 10, font: fontRegular });
    }
    currentY -= 15;
    page.drawText(`Next Term Fees: ${db.settings.nextTermFees}`, { x: 40, y: currentY, size: 10, font: fontRegular });
    currentY -= 15;
    page.drawText(`Next Term Opens On: ${db.settings.nextTermDate}`, { x: 40, y: currentY, size: 10, font: fontRegular });

    currentY -= 20;
    page.drawText(`Generated on: ${new Date().toLocaleDateString()}`, { x: 380, y: currentY, size: 9, font: fontRegular });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}

app.post('/api/generate-pdf/:id', async (req, res) => {
    const db = readDb();
    rankStudents(db);
    const ranked = db.students;
    const student = ranked.find(s => s.id === req.params.id);
    
    if (student) {
        try {
            const pdfBytes = await generatePDF(student, db);
            const pdfPath = path.join(REPORTS_DIR, `${student.name.replace(/\s+/g, '_')}.pdf`);
            fs.writeFileSync(pdfPath, pdfBytes);
            res.json({ success: true, fileName: `${student.name.replace(/\s+/g, '_')}.pdf` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.status(404).json({ error: "Student not found" });
    }
});

app.get('/api/preview-pdf/dummy', async (req, res) => {
    const db = readDb();
    const dummyStudent = {
        name: "John Doe (Preview)",
        phone: "N/A",
        rank: 1,
        mscePoints: 6,
        totalMarks: 580,
        subjectsCount: 6,
        subjects: { "ENG": true, "MATH": true, "BIO": true, "CHEM": true, "PHY": true, "AGR": true },
        marks: { "ENG": 95, "MATH": 98, "BIO": 92, "CHEM": 99, "PHY": 96, "AGR": 100 }
    };
    
    try {
        const pdfBytes = await generatePDF(dummyStudent, db);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
        res.send(Buffer.from(pdfBytes));
    } catch (e) {
        res.status(500).send("Error generating preview: " + e.message);
    }
});

app.get('/api/preview-pdf/:id', async (req, res) => {
    const db = readDb();
    rankStudents(db);
    const ranked = db.students;
    const student = ranked.find(s => s.id === req.params.id);
    
    if (student) {
        try {
            const pdfBytes = await generatePDF(student, db);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Content-Disposition', `inline; filename="${student.name.replace(/\s+/g, '_')}_preview.pdf"`);
            res.send(Buffer.from(pdfBytes));
        } catch (e) {
            res.status(500).send("Error generating preview: " + e.message);
        }
    } else {
        res.status(404).send("Student not found");
    }
});

// WhatsApp Integration using Baileys
let sock = null;
let qrCodeImage = null;
let wsConnectionStatus = "Disconnected";

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'info' })
    });
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log("CONNECTION UPDATE:", JSON.stringify({ connection, lastDisconnect: !!lastDisconnect, hasQr: !!qr }));
        
        if (qr) {
            wsConnectionStatus = "Scan QR Code";
            console.log("QR received from Baileys!");
            try {
                qrCodeImage = await QRCode.toDataURL(qr);
                console.log("QR Code successfully converted to data URL.");
            } catch (e) {
                console.error("Failed to generate QR data URL:", e);
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            wsConnectionStatus = "Disconnected";
            qrCodeImage = null;
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            wsConnectionStatus = "Connected";
            qrCodeImage = null;
            console.log('✅ WhatsApp successfully connected!');
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

// Start WhatsApp service in background
connectToWhatsApp();

app.get('/api/whatsapp/status', (req, res) => {
    res.json({ status: wsConnectionStatus, qr: qrCodeImage });
});

app.post('/api/whatsapp/send', async (req, res) => {
    const { studentId } = req.body;
    const db = readDb();
    rankStudents(db);
    const ranked = db.students;
    const student = ranked.find(s => s.id === studentId);

    if (!student) {
        return res.status(404).json({ error: "Student not found" });
    }

    if (wsConnectionStatus !== "Connected") {
        return res.status(400).json({ error: "WhatsApp is not connected. Scan the QR code first." });
    }

    if (!student.phone) {
        return res.status(400).json({ error: "No phone number saved for this student." });
    }

    try {
        // Ensure PDF is generated
        const pdfBytes = await generatePDF(student, db);
        const fileName = `${student.name.replace(/\s+/g, '_')}.pdf`;
        const pdfPath = path.join(REPORTS_DIR, fileName);
        fs.writeFileSync(pdfPath, pdfBytes);

        // Format JID: clean phone number and append @c.us
        let cleanNumber = student.phone.replace(/\D/g, '');
        // If no country code, default to Malawi (+265) or let user supply it
        if (cleanNumber.length === 9) {
            cleanNumber = "265" + cleanNumber; // Malawi standard format
        }
        const jid = `${cleanNumber}@c.us`;

        await sock.sendMessage(jid, {
            document: fs.readFileSync(pdfPath),
            fileName: fileName,
            mimetype: 'application/pdf',
            caption: `Here is the progress report card for ${student.name}.`
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
