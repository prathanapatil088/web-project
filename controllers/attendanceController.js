// controllers/attendanceController.js

const students = [];
const attendance = [];

async function addStudent(student) {
  students.push(student);
  return student;
}

async function markAttendance(studentId, date) {
  const record = { studentId, date, present: true };
  attendance.push(record);
  return record;
}

async function getAttendance(studentId) {
  return attendance.filter(a => a.studentId === studentId);
}

module.exports = {
  addStudent,
  markAttendance,
  getAttendance
};
