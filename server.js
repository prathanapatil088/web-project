const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const https = require('https');
const fs = require('fs');

// Try to load selfsigned
let selfsigned;
try {
    selfsigned = require('selfsigned');
} catch (e) {
    console.error("ERROR: 'selfsigned' module is missing. Running: npm install selfsigned");
    process.exit(1);
}

const app = express();
const PORT = 3000;

// Generate Certificates automatically
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/attendance_db', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('Connected to MongoDB');
    await seedTeachers(); // Pre-load teachers
}).catch(err => console.error('MongoDB connection error:', err));

// --- SCHEMAS ---

const TeacherSchema = new mongoose.Schema({
    teacherId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String,
    department: String,
    assignedCourses: { type: Map, of: [String] } 
});
const Teacher = mongoose.model('Teacher', TeacherSchema);

const StudentSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String
});
const Student = mongoose.model('Student', StudentSchema);

const SessionSchema = new mongoose.Schema({
    sessionId: String,
    teacherId: String,
    branch: String,
    semester: String,
    timeSlot: String,
    course: String,
    active: Boolean,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
});
const Session = mongoose.model('Session', SessionSchema);

const AttendanceSchema = new mongoose.Schema({
    sessionId: String,
    studentId: String,
    course: String,
    branch: String,
    semester: String,
    timeSlot: String,
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'Present' },
    ipAddress: String
});
const Attendance = mongoose.model('Attendance', AttendanceSchema);


// --- SEED DATA ---
async function seedTeachers() {
    const teachers = [
        { teacherId: "T001", password: "password123", name: "John Doe", department: "CSE", assignedCourses: { "5": ["Software Engineering"], "6": ["Cloud Computing"] } },
        { teacherId: "T002", password: "password123", name: "Jane Smith", department: "ECE", assignedCourses: { "3": ["Circuit Theory"], "4": ["Digital Logic"] } },
        { teacherId: "T003", password: "password123", name: "Robert Brown", department: "MECH", assignedCourses: { "7": ["Thermodynamics"], "8": ["Fluid Mechanics"] } }
    ];
    for (const t of teachers) {
        await Teacher.findOneAndUpdate({ teacherId: t.teacherId }, t, { upsert: true, new: true });
    }
    console.log("Teachers seeded/updated.");
}

// --- ROUTES ---

app.post('/api/teacher-login', async (req, res) => {
    const { teacherId, password } = req.body;
    try {
        const teacher = await Teacher.findOne({ teacherId });
        if (!teacher) return res.json({ success: false, message: "Teacher ID not found" });
        if (teacher.password !== password) return res.json({ success: false, message: "Invalid Password" });
        res.json({ success: true, message: "Login Successful", teacherId: teacher.teacherId, name: teacher.name, department: teacher.department, assignedCourses: teacher.assignedCourses });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/student-login', async (req, res) => {
    const { studentId, password } = req.body;
    const srnRegex = /^02FE(22|23|24|25)[A-Z]{3}\d{3}$/i;
    if (!srnRegex.test(studentId)) {
        return res.json({ success: false, message: "Invalid SRN format. Example: 02FE24BCS410" });
    }
    try {
        let student = await Student.findOne({ studentId });
        if (!student) {
            student = new Student({ studentId, password, name: "Student " + studentId });
            await student.save();
        } else {
            if (student.password !== password) {
                return res.json({ success: false, message: "Invalid Password" });
            }
        }
        res.json({ success: true, message: "Login Successful", studentId: student.studentId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/create-session', async (req, res) => {
    try {
        const { branch, semester, course, teacherId, timeSlot } = req.body;
        const sessionId = 'SES-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const newSession = new Session({ sessionId, teacherId, branch, semester, course, timeSlot, active: true, expiresAt: new Date(Date.now() + 60000) });
        await newSession.save();
        res.json({ success: true, sessionId, expiresAt: newSession.expiresAt });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/session/:sessionId', async (req, res) => {
    try {
        const session = await Session.findOne({ sessionId: req.params.sessionId });
        if (!session) return res.status(404).json({ success: false, message: "Session not found" });
        const count = await Attendance.countDocuments({ sessionId: req.params.sessionId });
        const attendeesRecords = await Attendance.find({ sessionId: req.params.sessionId }).select('studentId');
        const attendees = attendeesRecords.map(a => a.studentId);
        res.json({ success: true, session: { ...session.toObject(), attendees, count } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/mark-attendance', async (req, res) => {
    try {
        const { sessionId, studentId } = req.body;
        let ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ipAddress === '::1') ipAddress = '127.0.0.1';

        const session = await Session.findOne({ sessionId });
        if (!session) return res.json({ success: false, message: "Invalid Session ID" });
        if (!session.active) return res.json({ success: false, message: "Session is inactive" });
        if (new Date() > session.expiresAt) {
            session.active = false;
            await session.save();
            return res.json({ success: false, message: "Session expired" });
        }

        const existingStudent = await Attendance.findOne({ sessionId, studentId });
        if (existingStudent) return res.json({ success: true, message: "Attendance already marked", alreadyMarked: true });

        const existingIp = await Attendance.findOne({ sessionId, ipAddress });
        if (existingIp) return res.json({ success: false, message: "Proxy Alert: This device has already marked attendance!" });

        const newAttendance = new Attendance({ sessionId, studentId, course: session.course, branch: session.branch, semester: session.semester, timeSlot: session.timeSlot, date: new Date(), ipAddress: ipAddress });
        await newAttendance.save();
        res.json({ success: true, message: "Attendance marked successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/student-history/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const history = await Attendance.find({ studentId }).sort({ date: -1 });
        res.json({ success: true, history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/teacher/report', async (req, res) => {
    try {
        const { date, course, timeSlot } = req.body;
        if (!date) return res.status(400).json({ success: false, message: "Date is required" });

        const start = new Date(date);
        if (isNaN(start.getTime())) return res.status(400).json({ success: false, message: "Invalid date format" });
        
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        const query = { date: { $gte: start, $lte: end } };
        if (course) query.course = course;
        if (timeSlot) query.timeSlot = timeSlot;

        const attendanceBySession = await Attendance.aggregate([
            { $match: query },
            { $sort: { date: 1 } },
            {
                $group: {
                    _id: "$sessionId",
                    course: { $first: "$course" },
                    timeSlot: { $first: "$timeSlot" },
                    count: { $sum: 1 }, // ADDED: Count records in each group
                    records: { $push: { studentId: "$studentId", date: "$date", status: "$status", timeSlot: "$timeSlot" } }
                }
            }
        ]);
        res.json({ success: true, data: attendanceBySession });
    } catch (err) {
        console.error("Report Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const httpsOptions = { key: pems.private, cert: pems.cert };
https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIpAddress();
    console.log(`\n=== SERVER STARTED ===`);
    console.log(`Main Dashboard: https://${ip}:${PORT}`);
    console.log(`Student Access: https://${ip}:${PORT}/student.html`);
    console.log(`Teacher Access: https://${ip}:${PORT}/teacher.html`);
    console.log(`======================\n`);
});
