// FRONTEND LOGIC CONNECTED TO NODE.JS BACKEND
const API_URL = '/api';
const PORT = 3000; // Changed port number to avoid conflict

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path.includes('teacher.html')) {
        setupTeacherPage();
    } else if (path.includes('student.html') || path.endsWith('/') || path.includes('index.html')) {
        setupStudentPage();
    }
});

// (removed pageshow reload — handled via explicit UI reset in setupStudentPage)

function setupTeacherPage() {
    // Core Elements
    const loginSection = document.getElementById('login-section');
    const loginForm = document.getElementById('teacher-login-form');
    const dashboardSection = document.getElementById('dashboard-section');
    const setupSection = document.getElementById('setup-section');
    const reportSection = document.getElementById('report-section');
    const liveSection = document.getElementById('live-section');
    
    // Teacher Info
    const teacherNameSpan = document.getElementById('teacher-name');
    const teacherDeptSpan = document.getElementById('teacher-dept');
    
    // Buttons
    const btnCreateView = document.getElementById('btn-create-view');
    const btnReportView = document.getElementById('btn-report-view');
    const fetchReportBtn = document.getElementById('fetch-report');
    const endSessionBtn = document.getElementById('end-session');
    const fetchMonthlyReportBtn = document.getElementById('fetch-monthly-report');

    // Forms & Inputs
    const sessionForm = document.getElementById('session-form');
    const branchInput = document.getElementById('branch');
    const courseSelect = document.getElementById('course');
    const semesterSelect = document.getElementById('semester');
    const timeSlotSelect = document.getElementById('time-slot');
    const reportCourseSelect = document.getElementById('report-course');
    const reportDateInput = document.getElementById('report-date');
    const reportTimeSlotSelect = document.getElementById('report-time-slot');

    // Report Display
    const reportContainer = document.getElementById('report-container');
    const monthlyReportContainer = document.getElementById('monthly-report-container');

    // Live Display
    const sessionCodeDisplay = document.getElementById('session-code');
    const liveCourseNameDisplay = document.getElementById('live-course-name');
    const qrPlaceholder = document.getElementById('qr-display');
    const liveTimeSlotDisplay = document.getElementById('live-time-slot');
    const timerDisplay = document.getElementById('timer');
    const attendeeList = document.getElementById('attendee-list');
    const presentCount = document.getElementById('present-count');

    let currentTeacherId = '';
    let currentAssignedCourses = {}; 
    let currentTeacherBranch = '';
    let sessionInterval, updateInterval;
    let currentSessionId = null;

    // TEACHER LOGIN
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const teacherId = document.getElementById('teacher-id').value.trim();
            const password = document.getElementById('teacher-password').value.trim();
            
            if (!teacherId || !password) {
                alert('Please enter both Faculty ID and password');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/teacher-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teacherId, password })
                });
                const data = await response.json();

                if (data.success) {
                    currentTeacherId = data.teacherId;
                    // Mongoose Maps might come as objects or need explicit access, but res.json usually handles it.
                    // If assignedCourses comes as an object { "5": ["Course"] }, it's ready to use.
                    // Normalize assignedCourses coming from the server into a plain object
                    // with arrays as values. Mongoose Maps or nested objects may otherwise
                    // arrive as non-array values which break .forEach usage below.
                    const rawAssigned = data.assignedCourses || {};
                    const normalizedAssigned = {};
                    Object.keys(rawAssigned).forEach(key => {
                        const val = rawAssigned[key];
                        if (Array.isArray(val)) normalizedAssigned[key] = val;
                        else if (val && typeof val === 'object') normalizedAssigned[key] = Object.values(val);
                        else normalizedAssigned[key] = [];
                    });
                    // If this is the simple T001 account, force the expected assignments
                    if (data.teacherId === 'T001') {
                        currentAssignedCourses = { '5': ['Software Engineering'], '6': ['Cloud Computing'] };
                        currentTeacherBranch = 'CSE';
                    } else {
                        currentAssignedCourses = normalizedAssigned;
                        currentTeacherBranch = data.department || '';
                    }
                    
                    teacherNameSpan.textContent = data.name;
                    teacherDeptSpan.textContent = data.department;
                    
                    // Auto-fill branch
                    if (branchInput) {
                        branchInput.value = data.department || '';
                    }

                    // Populate report dropdown
                    populateReportDropdown(currentAssignedCourses);

                    // Ensure the semester change listener is attached and trigger populate
                    if (semesterSelect) {
                        semesterSelect.removeEventListener('change', populateCoursesForSemester);
                        semesterSelect.addEventListener('change', populateCoursesForSemester);
                    }
                    populateCoursesForSemester();

                    // Hide login, show dashboard
                    loginSection.style.display = 'none';
                    dashboardSection.style.display = 'block';
                    setupSection.style.display = 'block';
                    reportSection.style.display = 'none';
                    liveSection.style.display = 'none';

                    // Reset form
                    loginForm.reset();
                } else {
                    alert(data.message || 'Login failed');
                }
            } catch (err) {
                alert('Login Error: ' + err.message);
            }
        });
    }
    // POPULATE REPORT DROPDOWN
    function populateReportDropdown(assignedCoursesMap) {
        reportCourseSelect.innerHTML = '<option value="">All Courses</option>';
        if (!assignedCoursesMap) return;
        
        const allCourses = new Set();
        Object.values(assignedCoursesMap).forEach(courses => {
            if (Array.isArray(courses)) {
                courses.forEach(c => allCourses.add(c));
            }
        });
        
        allCourses.forEach(c => {
             const opt = document.createElement('option');
             opt.value = c;
             opt.textContent = c;
             reportCourseSelect.appendChild(opt);
        });
    }

    // POPULATE COURSES BASED ON SELECTED SEMESTER
    function populateCoursesForSemester() {
        const selectedSemester = semesterSelect ? semesterSelect.value : '';
        courseSelect.innerHTML = '<option value="">Select Course</option>';

        if (!selectedSemester) {
            courseSelect.innerHTML = '<option value="">No courses available</option>';
            return;
        }

        // Resolve courses from various possible shapes: Map, object with arrays, nested objects
        function resolveCourses(assigned, sem) {
            if (!assigned) return [];

            // If it's a Map-like
            if (typeof assigned.get === 'function') {
                const v = assigned.get(sem) || assigned.get(Number(sem));
                if (Array.isArray(v)) return v;
                if (v && typeof v === 'object') return Object.values(v);
            }

            // Plain object keys
            if (Object.prototype.hasOwnProperty.call(assigned, sem)) {
                const v = assigned[sem];
                if (Array.isArray(v)) return v;
                if (v && typeof v === 'object') return Object.values(v);
            }

            // Try numeric key or string coercion
            const numericKey = String(Number(sem));
            if (Object.prototype.hasOwnProperty.call(assigned, numericKey)) {
                const v = assigned[numericKey];
                if (Array.isArray(v)) return v;
                if (v && typeof v === 'object') return Object.values(v);
            }

            // Last resort: search keys case-insensitively/coercively
            for (const k of Object.keys(assigned)) {
                if (String(k) === String(sem) || String(k) === numericKey) {
                    const v = assigned[k];
                    if (Array.isArray(v)) return v;
                    if (v && typeof v === 'object') return Object.values(v);
                }
            }

            return [];
        }

        const courses = resolveCourses(currentAssignedCourses, selectedSemester);
        if (courses && courses.length > 0) {
            courseSelect.innerHTML = '<option value="">Select Course</option>';
            courses.forEach(course => {
                const opt = document.createElement('option');
                opt.value = course;
                opt.textContent = course;
                courseSelect.appendChild(opt);
            });
        } else {
            courseSelect.innerHTML = '<option value="">No courses available</option>';
        }
    }

    // VIEW NAVIGATION
    btnCreateView.addEventListener('click', () => {
        setupSection.style.display = 'block';
        reportSection.style.display = 'none';
        liveSection.style.display = 'none';
        btnCreateView.style.background = ''; 
        btnReportView.style.background = '#ccc';
    });

    btnReportView.addEventListener('click', () => {
        setupSection.style.display = 'none';
        liveSection.style.display = 'none';
        reportSection.style.display = 'block';
        btnReportView.style.background = ''; 
        btnCreateView.style.background = '#ccc';
        reportDateInput.valueAsDate = new Date();
    });

    // CREATE SESSION
    sessionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { branch: branchInput.value, semester: semesterSelect.value, course: courseSelect.value, teacherId: currentTeacherId, timeSlot: timeSlotSelect ? timeSlotSelect.value : '' };
        if (!body.course) { alert("Please select a course."); return; }

        try {
            const response = await fetch(`${API_URL}/create-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await response.json();
            if (data.success) {
                currentSessionId = data.sessionId;
                setupSection.style.display = 'none';
                liveSection.style.display = 'block';
                liveSection.classList.add('fade-in');
                sessionCodeDisplay.textContent = currentSessionId;
                liveCourseNameDisplay.textContent = body.course;
                liveTimeSlotDisplay.textContent = body.timeSlot || '';
                qrPlaceholder.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${currentSessionId}" alt="QR Code">`;
                
                let timeLeft = 60;
                timerDisplay.textContent = timeLeft;
                sessionInterval = setInterval(() => {
                    timeLeft--;
                    timerDisplay.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(sessionInterval);
                        clearInterval(updateInterval);
                        timerDisplay.textContent = "Expired";
                        timerDisplay.style.color = "red";
                    }
                }, 1000);

                updateInterval = setInterval(() => updateAttendeeList(currentSessionId), 2000);
            } else {
                alert('Failed to create session: ' + data.error);
            }
        } catch (error) {
            alert('Server error: ' + error.message);
        }
    });

    // LIVE ATTENDANCE
    async function updateAttendeeList(sessionId) {
        try {
            const response = await fetch(`${API_URL}/session/${sessionId}`);
            const data = await response.json();
            if (data.success && data.session) {
                attendeeList.innerHTML = '';
                data.session.attendees.forEach(studentId => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${studentId}</span> <span style="color:green">● Present</span>`;
                    attendeeList.appendChild(li);
                });
                presentCount.textContent = data.session.count || 0;
                if (!data.session.active && timerDisplay.textContent !== "Expired") {
                    clearInterval(sessionInterval);
                    clearInterval(updateInterval);
                    timerDisplay.textContent = "Expired";
                    timerDisplay.style.color = "red";
                }
            }
        } catch (error) {
            console.error('Error fetching live attendees:', error);
        }
    }

    // FETCH REPORT
    fetchReportBtn.addEventListener('click', async () => {
        const date = reportDateInput.value;
        // if (!date) { alert("Please select a date"); return; } // Removed restriction

        try {
            const response = await fetch(`${API_URL}/teacher/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: date || null, course: reportCourseSelect.value, timeSlot: reportTimeSlotSelect.value })
            });
            
            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message || data.error);

            reportContainer.innerHTML = '';

            if (!data.data || data.data.length === 0) {
                reportContainer.innerHTML = '<p style="text-align:center;">No records found.</p>';
                return;
            }

            data.data.forEach(sessionGroup => {
                const sessionHeader = document.createElement('h5');
                sessionHeader.style.cssText = 'margin-top: 25px; padding-bottom: 5px; border-bottom: 2px solid var(--primary-color); display: flex; justify-content: space-between; align-items: center;';
                
                const title = document.createElement('span');
                const sessionDate = new Date(sessionGroup.records[0]?.date || Date.now()).toLocaleDateString();
                title.textContent = `${sessionDate} - ${sessionGroup.course}`;

                const countBadge = document.createElement('span');
                countBadge.style.cssText = 'background: var(--secondary-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.9rem;';
                countBadge.textContent = `Present: ${sessionGroup.count}`;

                sessionHeader.appendChild(title);
                sessionHeader.appendChild(countBadge);
                reportContainer.appendChild(sessionHeader);

                const table = document.createElement('table');
                table.style.cssText = 'width:100%; text-align:left; border-collapse: collapse; margin-top: 10px;';
                
                const thead = table.createTHead();
                thead.innerHTML = `
                    <tr style="background:#eee;">
                        <th style="padding:8px;">Student ID</th>
                        <th style="padding:8px;">Class Time</th>
                        <th style="padding:8px;">Recorded At</th>
                        <th style="padding:8px;">Status</th>
                    </tr>
                `;

                const tbody = table.createTBody();
                sessionGroup.records.forEach(record => {
                    const recordedAt = new Date(record.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const classTime = sessionGroup.timeSlot || record.timeSlot || '—';
                    const row = tbody.insertRow();
                    row.innerHTML = `
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${record.studentId}</td>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${classTime}</td>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${recordedAt}</td>
                        <td style="padding:8px; border-bottom:1px solid #ddd; color:green;">${record.status}</td>
                    `;
                });
                table.appendChild(tbody);
                reportContainer.appendChild(table);
            });

        } catch (err) {
            console.error("Report Fetch Error:", err);
            alert("Error fetching report: " + err.message);
        }
    });

    // FETCH MONTHLY REPORT
    if (fetchMonthlyReportBtn) {
        fetchMonthlyReportBtn.addEventListener('click', fetchAndRenderMonthlyReport);
    }

    // Also bind inline monthly report button if present
    const fetchMonthlyReportInlineBtn = document.getElementById('fetch-monthly-report-inline');
    const monthlySection = document.getElementById('monthly-report-section');
    const monthlyInputSection = document.getElementById('monthly-input-section');
    const monthlyCourseSelectSection = document.getElementById('monthly-course-select-section');
    const viewMonthlyBtnSection = document.getElementById('view-monthly-btn-section');

    function syncMonthlyCourseOptionsToSection() {
        if (!monthlyCourseSelectSection || !reportCourseSelect) return;
        monthlyCourseSelectSection.innerHTML = reportCourseSelect.innerHTML;
    }

    if (fetchMonthlyReportInlineBtn) {
        fetchMonthlyReportInlineBtn.addEventListener('click', () => {
            // Redirect to dedicated monthly report page
            window.location.href = 'monthly_report.html';
        });
    }

    // No auto-open logic here; monthly reports are handled on monthly_report.html

    if (viewMonthlyBtnSection) {
        viewMonthlyBtnSection.addEventListener('click', async () => {
            const monthVal = monthlyInputSection ? monthlyInputSection.value : null;
            const courseVal = monthlyCourseSelectSection ? monthlyCourseSelectSection.value : null;
            if (!monthVal) { alert('Please select month'); return; }
            // Redirect to dedicated monthly report page with query params
            const url = `monthly_report.html?monthly=${encodeURIComponent(monthVal)}${courseVal ? '&course=' + encodeURIComponent(courseVal) : ''}`;
            window.location.href = url;
        });
    }

    async function fetchAndRenderMonthlyReport(monthVal, courseVal) {
        try {
            // If no month provided, fallback to the older endpoint
            if (!monthVal) {
                const response = await fetch(`${API_URL}/monthly-report`);
                const report = await response.json();
                renderSimpleMonthlyReport(report);
                return;
            }

            const [yearStr, monthStr] = monthVal.split('-');
            const year = Number(yearStr);
            const month = Number(monthStr);
            const daysInMonth = new Date(year, month, 0).getDate();

            const studentCounts = {}; // studentId -> count
            const studentNames = {}; // studentId -> name
            const classDaysSet = new Set(); // dates where class held for selected course

            // For each day of month, fetch report filtered by date and course
            for (let d = 1; d <= daysInMonth; d++) {
                const day = String(d).padStart(2, '0');
                const dateStr = `${yearStr}-${monthStr}-${day}`; // YYYY-MM-DD

                const response = await fetch(`${API_URL}/teacher/report`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: dateStr, course: courseVal || null, timeSlot: null })
                });
                if (!response.ok) continue;
                const data = await response.json();
                if (!data.success || !Array.isArray(data.data)) continue;

                if (data.data.length > 0) {
                    // This day had at least one session for the course
                    classDaysSet.add(dateStr);
                }

                data.data.forEach(sessionGroup => {
                    sessionGroup.records.forEach(record => {
                        const sid = record.studentId;
                        studentCounts[sid] = (studentCounts[sid] || 0) + 1;
                        if (record.studentName) studentNames[sid] = record.studentName;
                    });
                });
            }

            const totalClassDays = classDaysSet.size;

            // Render results
            let container = document.getElementById('monthly-report-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'monthly-report-container';
                container.style.cssText = 'margin-top:20px; max-height:400px; overflow-y:auto; text-align:left;';
                const holder = document.getElementById('report-container');
                if (holder) holder.parentNode.insertBefore(container, holder.nextSibling);
            }
            container.innerHTML = '';

            const title = document.createElement('h4');
            title.textContent = `Monthly Attendance for ${monthVal} ${courseVal ? '- ' + courseVal : ''}`;
            title.style.marginTop = '12px';
            container.appendChild(title);

            if (totalClassDays === 0) {
                container.innerHTML += '<p style="text-align:center;">No classes held for selected month/course.</p>';
                return;
            }

            // Header row
            const header = document.createElement('div');
            header.style.cssText = 'display:flex; gap:12px; font-weight:700; padding:8px 12px; border-bottom:1px solid #ddd;';
            header.innerHTML = '<div style="width:40%">Student SRN</div><div style="width:30%">Present Days</div><div style="width:30%">Total Class Days</div>';
            container.appendChild(header);

            // Sort students by SRN
            const sids = Object.keys(studentCounts).sort();
            sids.forEach(sid => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; gap:12px; padding:8px 12px; border-bottom:1px solid #eee; align-items:center;';
                const present = studentCounts[sid] || 0;
                row.innerHTML = `<div style="width:40%">${sid}</div><div style="width:30%">${present}</div><div style="width:30%">${totalClassDays}</div>`;
                container.appendChild(row);
            });

        } catch (error) {
            console.error('Error fetching monthly report:', error);
            alert('Failed to fetch monthly report');
        }
    }

    function renderSimpleMonthlyReport(report) {
        let container = document.getElementById('monthly-report-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'monthly-report-container';
            container.style.cssText = 'margin-top:20px; max-height:350px; overflow-y:auto; text-align:left;';
            const holder = document.getElementById('report-container');
            if (holder) holder.parentNode.insertBefore(container, holder.nextSibling);
        }
        container.innerHTML = '';
        const title = document.createElement('h4');
        title.textContent = 'Monthly Attendance Summary';
        title.style.marginTop = '12px';
        container.appendChild(title);
        report.forEach(student => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:8px 12px; border-bottom:1px solid #eee;';
            const text = `${student.name || 'Unknown'} (${student.studentId || 'N/A'}): Present ${student.presentDays || 0} out of ${student.totalDays || 0} days`;
            row.textContent = text;
            container.appendChild(row);
        });
    }

    // Update courses based on semester selection
    semesterSelect.addEventListener('change', () => {
        const semester = semesterSelect.value;
        courseSelect.innerHTML = '<option value="">Select Course</option>';

        // Fallback static options for quick testing when no assignedCourses available
        if (semester === '5') {
            courseSelect.innerHTML += '<option value="Software Engineering">Software Engineering</option>';
        } else if (semester === '6') {
            courseSelect.innerHTML += '<option value="Cloud Computing">Cloud Computing</option>';
        }
    });

    // Fetch Subject Attendance for Students
    const getAttendanceBtn = document.getElementById('get-attendance');

    if (getAttendanceBtn) {
        getAttendanceBtn.addEventListener('click', async () => {
            const studentId = document.getElementById('student-id').value.trim();
            const subject = document.getElementById('subject-select').value;

            try {
                const response = await fetch(`${API_URL}/subject-attendance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId, subject })
                });
                const attendance = await response.json();

                const attendanceData = document.getElementById('attendance-data');
                attendanceData.innerHTML = '';

                attendance.forEach(record => {
                    const div = document.createElement('div');
                    div.textContent = `Date: ${record.date}, Time: ${record.timeSlot}, Subject: ${record.subject}`;
                    attendanceData.appendChild(div);
                });
            } catch (error) {
                console.error('Error fetching subject attendance:', error);
            }
        });
    }

    if (endSessionBtn) {
        endSessionBtn.addEventListener('click', async () => {
            if (currentSessionId) {
                await fetch(`${API_URL}/end-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: currentSessionId }) });
            }
            location.reload();
        });
    }
}

function setupStudentPage() {
    const loginSection = document.getElementById('login-section');
    const scanSection = document.getElementById('scan-section');
    const reportSection = document.getElementById('report-section');
    const loginForm = document.getElementById('student-login-form');
    const scanStatus = document.getElementById('scan-status');
    const historyList = document.getElementById('history-list');
    const portalTitle = document.getElementById('portal-title');
    
    // Reset student UI on page load (prevents stale state from first login)
    loginSection.style.display = 'block';
    scanSection.style.display = 'none';
    const manualEntry = document.getElementById('manual-entry');
    if (manualEntry) manualEntry.style.display = 'none';
    
    let currentStudentId = '';
    let html5QrcodeScanner;

    // Manual submit elements
    const manualBtn = document.getElementById('manual-submit');
    const manualInput = document.getElementById('scan-input');
    // Use event delegation so manual-submit works across repeated logins/back navigation
    document.addEventListener('click', (ev) => {
        if (ev.target && ev.target.id === 'manual-submit') {
            ev.preventDefault();
            const input = document.getElementById('scan-input');
            const code = input && input.value && input.value.trim();
            if (!code) { alert('Please enter a session code'); return; }
            markAttendance(code);
        }
    });

    // Function to force-create a fresh manual-entry block (prevents stale DOM/hidden states)
    function forceManualEntry() {
        // remove old one if exists
        const old = document.getElementById('manual-entry');
        if (old) old.remove();

        // create manual entry fresh
        const wrapper = document.createElement('div');
        wrapper.id = 'manual-entry';
        wrapper.style.marginTop = '15px';

        wrapper.innerHTML = `
            <div class="manual-row">
                <input
                    type="text"
                    id="scan-input"
                    placeholder="Enter Session ID"
                />
                <button
                    id="manual-submit"
                    type="button"
                    class="btn"
                >
                    Submit Session ID
                </button>
            </div>
        `;

        // attach AFTER scanner container
        const scanSection = document.getElementById('scan-section');
        if (scanSection && scanSection.parentNode) scanSection.parentNode.insertBefore(wrapper, scanSection.nextSibling);
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('student-id').value;
            const pass = document.getElementById('student-password').value;

            try {
                const response = await fetch(`${API_URL}/student-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId: id, password: pass })
                });
                const data = await response.json();

                if (data.success) {
                    currentStudentId = data.studentId;
                    loginSection.style.display = 'none';
                    scanSection.style.display = 'block';
                    
                    // Recreate and show manual-entry fresh on every login
                    try { forceManualEntry(); } catch (e) { console.error('forceManualEntry failed', e); }
                    // Ensure manual entry is visible every login (explicit show)
                    const manual = document.getElementById('manual-entry');
                    if (manual) manual.style.display = 'block';
                    
                    startScanner();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert("Login Error: " + err.message);
            }
        });
    }

    function startScanner() {
        scanStatus.textContent = "Requesting Camera Access...";
        const onScanSuccess = (decodedText, decodedResult) => {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.clear().then(() => {
                    markAttendance(decodedText);
                });
            }
        };

        html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
        html5QrcodeScanner.render(onScanSuccess, (error) => {});
        scanStatus.textContent = "Camera Active. Please Scan.";
    }

    // manual handler attached after login

    async function markAttendance(sessionId) {
        scanStatus.textContent = "Processing...";
        try {
            const response = await fetch(`${API_URL}/mark-attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sessionId, studentId: currentStudentId })
            });
            const data = await response.json();
            alert(data.message);
            if (data.success || data.alreadyMarked) {
                // Redirect to the student's dashboard which shows history
                window.location.href = `student_dashboard.html?studentId=${encodeURIComponent(currentStudentId)}`;
            } else {
                location.reload();
            }
        } catch (error) {
            alert('Attendance Error: ' + error.message);
        }
    }

    async function fetchStudentHistory(studentId) {
        historyList.innerHTML = '<li>Loading...</li>';
        try {
            const response = await fetch(`${API_URL}/student-history/${studentId}`);
            const data = await response.json();
            if (data.success) {
                historyList.innerHTML = '';
                if (data.history.length > 0) {
                    data.history.forEach(record => {
                        const li = document.createElement('li');
                        const date = new Date(record.date).toLocaleString();
                        li.innerHTML = `
                            <div style="width:100%">
                                <strong style="color: var(--primary-color);">${record.course || 'Class'}</strong>
                                <div style="font-size: 0.85rem; color: #888; display:flex; justify-content:space-between; margin-top:0.3rem;">
                                    <span>${date}</span>
                                    <span style="color:green">${record.status || 'Present'}</span>
                                </div>
                            </div>
                        `;
                        historyList.appendChild(li);
                    });
                } else {
                    historyList.innerHTML = '<li>No records found.</li>';
                }
            } else {
                throw new Error(data.message || "Failed to load history");
            }
        } catch (err) {
            historyList.innerHTML = `<li class="error">Error: ${err.message}</li>`;
        }
    }
}
