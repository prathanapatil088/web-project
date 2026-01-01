const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');

const app = express();
const PORT = 3000; // Changed port number to avoid permission issues

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// ---------- MONGODB ----------
mongoose.connect('mongodb://localhost:27017/attendance_db', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('✅ Connected to MongoDB');
    await seedTeachers();
}).catch(err => console.error('❌ MongoDB error:', err));

// ---------- SCHEMAS ----------

const TeacherSchema = new mongoose.Schema({
    teacherId: { type: String, unique: true },
    password: String,
    name: String,
    department: String,
    assignedCourses: { type: Map, of: [String] }
});
const Teacher = mongoose.model('Teacher', TeacherSchema);

const StudentSchema = new mongoose.Schema({
    studentId: { type: String, unique: true },
    password: String,
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

// ---------- SEED TEACHERS ----------
async function seedTeachers() {
    const teachers = [
        { teacherId: "T001", password: "password123", name: "John Doe", department: "CSE", assignedCourses: { "5": ["Software Engineering"], "6": ["Cloud Computing"] } },
        { teacherId: "T002", password: "password123", name: "Jane Smith", department: "ECE", assignedCourses: { "3": ["Circuit Theory"], "4": ["Digital Logic"] } }
    ];
    for (const t of teachers) {
        await Teacher.findOneAndUpdate(
            { teacherId: t.teacherId },
            t,
            { upsert: true }
        );
    }
    console.log("✅ Teachers seeded");
}

// ---------- ROUTES ----------

// Fix for typo in URL
app.get('/teacher.htm', (req, res) => {
    res.redirect('/teacher.html');
});
app.get('/student.htm', (req, res) => {
    res.redirect('/student.html');
});

app.post('/api/teacher-login', async (req, res) => {
    const { teacherId, password } = req.body;
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher || teacher.password !== password) {
        return res.json({ success: false, message: "Invalid Credentials" });
    }
    // Convert Mongoose document to object to ensure Map is serialized correctly as JSON
    res.json({ success: true, ...teacher.toObject() });
});

app.post('/api/student-login', async (req, res) => {
    const { studentId, password } = req.body;
    let student = await Student.findOne({ studentId });
    if (!student) {
        student = new Student({
            studentId,
            password,
            name: "Student " + studentId
        });
        await student.save();
    }
    res.json({ success: true, studentId });
});

app.post('/api/create-session', async (req, res) => {
    const { branch, semester, course, teacherId, timeSlot } = req.body;
    const sessionId = 'SES-' + Math.random().toString(36).substr(2, 9).toUpperCase();

    const session = new Session({
        sessionId,
        teacherId,
        branch,
        semester,
        course,
        timeSlot,
        active: true,
        expiresAt: new Date(Date.now() + 60000) // 1 minute
    });

    await session.save();
    res.json({ success: true, sessionId });
});

app.post('/api/mark-attendance', async (req, res) => {
    const { sessionId, studentId } = req.body;
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const session = await Session.findOne({ sessionId });
    if (!session || !session.active || new Date() > session.expiresAt) {
        return res.json({ success: false, message: "Session expired" });
    }

    const exists = await Attendance.findOne({ sessionId, studentId });
    if (exists) {
        return res.json({ success: true, message: "Already marked" });
    }

    await new Attendance({
        sessionId,
        studentId,
        course: session.course,
        branch: session.branch,
        semester: session.semester,
        timeSlot: session.timeSlot,
        ipAddress: ip
    }).save();

    res.json({ success: true, message: "Attendance marked" });
});

// NEW: Report Route
app.post('/api/teacher/report', async (req, res) => {
    try {
        const { date, course, timeSlot } = req.body;
        
        // 1. Build query for Sessions
        let sessionQuery = {};
        
        // Date filter: Sessions created on that date (ignoring time)
        if (date) {
            const start = new Date(date);
            start.setHours(0,0,0,0);
            const end = new Date(date);
            end.setHours(23,59,59,999);
            sessionQuery.createdAt = { $gte: start, $lte: end };
        }
        
        if (course) sessionQuery.course = course;
        if (timeSlot) sessionQuery.timeSlot = timeSlot;

        // 2. Find matching sessions
        const sessions = await Session.find(sessionQuery).sort({ createdAt: -1 });
        const sessionIds = sessions.map(s => s.sessionId);

        if (sessionIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // 3. Find attendance for these sessions
        const attendanceRecords = await Attendance.find({ sessionId: { $in: sessionIds } });

        // 4. Group data for frontend
        let reportData = sessions.map(session => {
            const records = attendanceRecords.filter(a => a.sessionId === session.sessionId);
            return {
                _id: session.sessionId,
                course: session.course,
                branch: session.branch,
                semester: session.semester,
                timeSlot: session.timeSlot,
                count: records.length,
                records: records
            };
        });

        res.json({ success: true, data: reportData });

    } catch (err) {
        console.error("Report Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await Session.findOne({ sessionId });
        if (!session) return res.json({ success: false, message: "Session not found" });
        
        const attendees = await Attendance.find({ sessionId });
        res.json({
            success: true,
            session: {
                ...session.toObject(),
                count: attendees.length,
                attendees: attendees.map(a => a.studentId)
            }
        });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/end-session', async (req, res) => {
    const { sessionId } = req.body;
    await Session.findOneAndUpdate({ sessionId }, { active: false });
    res.json({ success: true });
});

app.get('/api/student-history/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const history = await Attendance.find({ studentId }).sort({ date: -1 });
    res.json({ success: true, history });
});

const { getMonthlyReport, getSubjectAttendance } = require('./controllers/attendanceController');

// Fetch Monthly Attendance Report
app.get('/api/monthly-report', async (req, res) => {
  try {
    const report = await getMonthlyReport();
    res.json(report);
  } catch (error) {
    console.error('Error fetching monthly report:', error);
    res.status(500).json({ error: 'Failed to fetch monthly report' });
  }
});

// Fetch Subject-Specific Attendance for a Student
app.post('/api/subject-attendance', async (req, res) => {
  const { studentId, subject } = req.body;

  if (!studentId || !subject) {
    return res.status(400).json({ error: 'Student ID and subject are required' });
  }

  try {
    const attendance = await getSubjectAttendance(studentId, subject);
    res.json(attendance);
  } catch (error) {
    console.error('Error fetching subject attendance:', error);
    res.status(500).json({ error: 'Failed to fetch subject attendance' });
  }
});

// ---------- START SERVER (HTTP) ----------

function getLocalIpAddress() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIpAddress();
    console.log('\n=== SERVER STARTED ===');
    console.log(`Dashboard : http://${ip}:${PORT}`);
    console.log(`Student   : http://${ip}:${PORT}/student.html`);
    console.log(`Teacher   : http://${ip}:${PORT}/teacher.html`);
    console.log('=====================\n');
});
