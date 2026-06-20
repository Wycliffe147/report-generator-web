const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const multer = require('multer');

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
        subjects: ["AGR", "BK", "BIO", "CHEM", "CHICH", "COMP", "ENG", "GEO", "HIST", "PHY", "MATH", "SOS"],
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
        writeDb(db);
    }
    return db;
}

function writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Calculate MANEB Grades
function getGrade(score) {
    if (score === null || score === undefined || score === '') return { grade: '-', points: 9, remark: 'No Grade' };
    const num = Number(score);
    if (num >= 80) return { grade: "D1", points: 1, remark: "Distinction" };
    if (num >= 75) return { grade: "D2", points: 2, remark: "Distinction" };
    if (num >= 70) return { grade: "C3", points: 3, remark: "Credit" };
    if (num >= 65) return { grade: "C4", points: 4, remark: "Credit" };
    if (num >= 60) return { grade: "C5", points: 5, remark: "Credit" };
    if (num >= 50) return { grade: "C6", points: 6, remark: "Credit" };
    if (num >= 45) return { grade: "P7", points: 7, remark: "Pass" };
    if (num >= 40) return { grade: "P8", points: 8, remark: "Pass" };
    return { grade: "F9", points: 9, remark: "Fail" };
}

// Calculate Student Rankings
function calculateRankings(db) {
    const students = db.students.map(s => {
        let total = 0;
        let subjectsCount = 0;
        let pointsArray = [];

        db.subjects.forEach(sub => {
            if (s.subjects[sub]) {
                const score = s.marks[sub];
                if (score !== null && score !== undefined && score !== '') {
                    total += Number(score);
                    subjectsCount++;
                    pointsArray.push(getGrade(score).points);
                } else {
                    pointsArray.push(9); // Unentered marks count as F9 (9 pts)
                }
            }
        });

        // MSCE aggregate: sum of 6 best subjects
        pointsArray.sort((a, b) => a - b);
        const mscePoints = pointsArray.slice(0, 6).reduce((sum, pts) => sum + pts, 0);

        return {
            ...s,
            totalMarks: total,
            subjectsCount,
            mscePoints: subjectsCount >= 6 ? mscePoints : 'Inc'
        };
    });

    // Sort by MSCE Points ascending (lower points is better rank), then total marks descending
    students.sort((a, b) => {
        if (a.mscePoints === 'Inc' && b.mscePoints !== 'Inc') return 1;
        if (b.mscePoints === 'Inc' && a.mscePoints !== 'Inc') return -1;
        if (a.mscePoints !== b.mscePoints) {
            return a.mscePoints - b.mscePoints;
        }
        return b.totalMarks - a.totalMarks;
    });

    // Assign Rank
    let rank = 1;
    for (let i = 0; i < students.length; i++) {
        if (i > 0 && students[i].mscePoints !== students[i - 1].mscePoints) {
            rank = i + 1;
        }
        students[i].rank = students[i].mscePoints === 'Inc' ? '-' : rank;
    }

    return students;
}

// API Routes
app.get('/api/settings', (req, res) => {
    res.json(readDb().settings);
});

app.post('/api/settings', upload.single('logo'), (req, res) => {
    const db = readDb();
    if (req.body.schoolName) db.settings.schoolName = req.body.schoolName;
    if (req.body.subtitle) db.settings.subtitle = req.body.subtitle;
    if (req.body.themeColor) db.settings.themeColor = req.body.themeColor;
    
    if (req.file) {
        db.settings.logoPath = req.file.path;
    }
    
    writeDb(db);
    res.json({ success: true, settings: db.settings });
});

app.get('/api/students', (req, res) => {
    const db = readDb();
    const ranked = calculateRankings(db);
    res.json(ranked);
});

app.post('/api/students', (req, res) => {
    const db = readDb();
    const { id, name, phone, subjects } = req.body;
    
    if (id) {
        // Update
        const idx = db.students.findIndex(s => s.id === id);
        if (idx !== -1) {
            db.students[idx].name = name;
            db.students[idx].phone = phone;
            // Update subjects taking
            db.subjects.forEach(sub => {
                db.students[idx].subjects[sub] = !!subjects[sub];
                if (!subjects[sub]) {
                    delete db.students[idx].marks[sub]; // remove mark if subject untaken
                }
            });
        }
    } else {
        // Create new
        const newStudent = {
            id: 'std_' + Date.now(),
            name,
            phone,
            subjects: {},
            marks: {}
        };
        db.subjects.forEach(sub => {
            newStudent.subjects[sub] = !!subjects[sub];
        });
        db.students.push(newStudent);
    }
    writeDb(db);
    res.json({ success: true });
});

app.delete('/api/students/:id', (req, res) => {
    const db = readDb();
    db.students = db.students.filter(s => s.id !== req.params.id);
    writeDb(db);
    res.json({ success: true });
});

app.post('/api/marks', (req, res) => {
    const db = readDb();
    const { id, marks } = req.body;
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

    // Student Info Block
    page.drawText(`Student Name: ${student.name}`, { x: 40, y: height - 140, size: 12, font: fontBold });
    page.drawText(`Phone / Guardian Contact: ${student.phone || 'N/A'}`, { x: 40, y: height - 160, size: 10, font: fontRegular });
    page.drawText(`Class Rank: ${student.rank} of ${db.students.length}`, { x: 380, y: height - 140, size: 12, font: fontBold });
    page.drawText(`MSCE Aggregate Points: ${student.mscePoints} (Best 6 Subjects)`, { x: 380, y: height - 160, size: 10, font: fontRegular });

    // Table Header
    const tableTop = height - 200;
    page.drawLine({ start: { x: 40, y: tableTop }, end: { x: 550, y: tableTop }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
    
    page.drawText('Subject', { x: 50, y: tableTop - 20, size: 10, font: fontBold });
    page.drawText('Score (%)', { x: 200, y: tableTop - 20, size: 10, font: fontBold });
    page.drawText('Points', { x: 330, y: tableTop - 20, size: 10, font: fontBold });
    page.drawText('Remark', { x: 450, y: tableTop - 20, size: 10, font: fontBold });
    
    page.drawLine({ start: { x: 40, y: tableTop - 30 }, end: { x: 550, y: tableTop - 30 }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });

    // Table Body
    let currentY = tableTop - 50;
    db.subjects.forEach((sub) => {
        if (student.subjects[sub]) {
            const score = student.marks[sub];
            const hasScore = score !== null && score !== undefined && score !== '';
            const gradeInfo = hasScore ? getGrade(score) : { grade: '-', points: '-', remark: 'Absent/No Score' };

            page.drawText(sub, { x: 50, y: currentY, size: 10, font: fontRegular });
            page.drawText(hasScore ? `${score}%` : '-', { x: 200, y: currentY, size: 10, font: fontRegular });
            page.drawText(String(gradeInfo.points), { x: 330, y: currentY, size: 10, font: fontRegular });
            page.drawText(gradeInfo.remark, { x: 450, y: currentY, size: 10, font: fontRegular });

            // Light separation line
            page.drawLine({ start: { x: 40, y: currentY - 8 }, end: { x: 550, y: currentY - 8 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
            currentY -= 25;
        }
    });

    // Summary Details at Bottom
    currentY -= 20;
    page.drawText(`Total Marks Scored: ${student.totalMarks} Points`, { x: 40, y: currentY, size: 11, font: fontBold });
    page.drawText(`Generated on: ${new Date().toLocaleDateString()}`, { x: 380, y: currentY, size: 9, font: fontRegular });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}

app.post('/api/generate-pdf/:id', async (req, res) => {
    const db = readDb();
    const ranked = calculateRankings(db);
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
    const ranked = calculateRankings(db);
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
    const ranked = calculateRankings(db);
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
