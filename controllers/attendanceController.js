// controllers/attendanceController.js

const students = [];
const attendance = [];

async function addStudent(student) {
  if (!student.name || !student.id) {
    throw new Error('Missing required fields: name or id');
  }
  students.push(student);
  return student;
}

async function markAttendance(studentId, date, timeSlot, subject) {
  // Validate student ID
  const studentExists = students.some(student => student.id === studentId);
  if (!studentExists) {
    throw new Error('Invalid student ID');
  }

  // Prevent duplicate attendance records
  const duplicateRecord = attendance.find(
    record => record.studentId === studentId && record.date === date
  );
  if (duplicateRecord) {
    return duplicateRecord;
  }

  const record = { studentId, date, timeSlot, subject, present: true };
  attendance.push(record);
  return record;
}

async function getAttendance(studentId) {
  return attendance.filter(a => a.studentId === studentId);
}

async function getMonthlyReport() {
  const report = students.map(student => {
    const studentAttendance = attendance.filter(a => a.studentId === student.id);
    const totalDays = new Set(attendance.map(a => a.date)).size;
    const presentDays = studentAttendance.length;

    return {
      studentId: student.id,
      name: student.name,
      presentDays,
      totalDays,
    };
  });

  return report;
}

async function getSubjectAttendance(studentId, subject) {
  const subjectAttendance = attendance.filter(
    a => a.studentId === studentId && a.subject === subject
  );

  return subjectAttendance.map(record => ({
    date: record.date,
    timeSlot: record.timeSlot,
    subject: record.subject,
  }));
}

module.exports = {
  addStudent,
  markAttendance,
  getAttendance,
  getMonthlyReport,
  getSubjectAttendance,
};

