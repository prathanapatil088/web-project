const {
  addStudent,
  markAttendance,
  getAttendance
} = require('../controllers/attendanceController');

// Test cases designed to run in Jenkins CI/CD pipeline

// Test Case 1: Add a new student
// This test ensures that a student can be added successfully.
test('1. Add a new student', async () => {
  const result = await addStudent({ name: 'John Doe', id: '123' });
  expect(result.name).toBe('John Doe');
});

// Test Case 2: Mark attendance for a student
// This test ensures that attendance can be marked for a valid student.
test('2. Mark attendance for student', async () => {
  const result = await markAttendance('123', '2025-12-31');
  expect(result.present).toBe(true);
});

// Test Case 3: Retrieve attendance for a student
// This test ensures that attendance records can be retrieved for a student.
test('3. Retrieve attendance for student', async () => {
  const records = await getAttendance('123');
  expect(records.length).toBeGreaterThan(0);
});

// Test Case 4: Prevent duplicate attendance records
// This test ensures that duplicate attendance records are not created.
test('4. Prevent duplicate attendance records', async () => {
  await markAttendance('123', '2025-12-31');
  const records = await getAttendance('123');
  expect(records.length).toBe(1);
});

// Test Case 5: Handle invalid student ID
// This test ensures that an error is thrown for an invalid student ID.
test('5. Handle invalid student ID', async () => {
  await expect(markAttendance('invalid', '2025-12-31')).rejects.toThrow();
});

// Test Case 6: Add multiple students
// This test ensures that multiple students can be added successfully.
test('6. Add multiple students', async () => {
  const students = [
    { name: 'Alice', id: '001' },
    { name: 'Bob', id: '002' }
  ];
  for (const student of students) {
    const result = await addStudent(student);
    expect(result.name).toBe(student.name);
  }
});

// Test Case 7: Retrieve attendance for non-existent student
// This test ensures that no attendance records are returned for a non-existent student.
test('7. Retrieve attendance for non-existent student', async () => {
  const records = await getAttendance('999');
  expect(records.length).toBe(0);
});

// Test Case 8: Ensure attendance is date-specific
// This test ensures that attendance is recorded for the correct date.
test('8. Ensure attendance is date-specific', async () => {
  await markAttendance('001', '2025-12-30');
  const records = await getAttendance('001');
  const dates = records.map(r => r.date);
  expect(dates).toContain('2025-12-30');
  expect(dates).not.toContain('2025-12-31');
});

// Test Case 9: Verify attendance data structure
// This test ensures that the attendance record has the correct structure.
test('9. Verify attendance data structure', async () => {
  const result = await markAttendance('002', '2025-12-31');
  expect(result).toHaveProperty('studentId', '002');
  expect(result).toHaveProperty('date', '2025-12-31');
});

// Test Case 10: Handle missing fields when adding a student
// This test ensures that an error is thrown when required fields are missing.
test('10. Handle missing fields when adding a student', async () => {
  await expect(addStudent({ id: '003' })).rejects.toThrow();
});
