const {
  addStudent,
  markAttendance,
  getAttendance
} = require('../controllers/attendanceController');

test('Add a new student', async () => {
  const result = await addStudent({ name: 'John Doe', id: '123' });
  expect(result.name).toBe('John Doe');
});

test('Mark attendance for student', async () => {
  const result = await markAttendance('123', '2025-12-31');
  expect(result.present).toBe(true);
});

test('Retrieve attendance for student', async () => {
  const records = await getAttendance('123');
  expect(records.length).toBeGreaterThan(0);
});
