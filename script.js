// FRONTEND LOGIC CONNECTED TO NODE.JS BACKEND
const API_URL = '/api';

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
                    currentAssignedCourses = data.assignedCourses;
                    currentTeacherBranch = data.department;
                    
                    teacherNameSpan.textContent = data.name;
                    teacherDeptSpan.textContent = data.department;
                    branchInput.value = data.department;

                    // Populate report dropdown
                    populateReportDropdown(currentAssignedCourses);

                    // Add semester change listener to dynamically populate courses
                    semesterSelect.addEventListener('change', () => {
                        populateCoursesForSemester();
                    });

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
        for (const sem in assignedCoursesMap) {
            if (Object.hasOwnProperty.call(assignedCoursesMap, sem)) {
                assignedCoursesMap[sem].forEach(c => {
                    if (![...reportCourseSelect.options].some(opt => opt.value === c)) {
                        const opt = document.createElement('option');
                        opt.value = c;
                        opt.textContent = c;
                        reportCourseSelect.appendChild(opt);
                    }
                });
            }
        }
    }

    // POPULATE COURSES BASED ON SELECTED SEMESTER
    function populateCoursesForSemester() {
        const selectedSemester = semesterSelect.value;
        courseSelect.innerHTML = '<option value="">Select Course</option>';
        
        if (selectedSemester && currentAssignedCourses[selectedSemester]) {
            currentAssignedCourses[selectedSemester].forEach(course => {
                const opt = document.createElement('option');
                opt.value = course;
                opt.textContent = course;
                courseSelect.appendChild(opt);
            });
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
        if (!date) { alert("Please select a date"); return; }

        try {
            const response = await fetch(`${API_URL}/teacher/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, course: reportCourseSelect.value, timeSlot: reportTimeSlotSelect.value })
            });
            
            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message || data.error);

            reportContainer.innerHTML = '';

            if (data.data.length === 0) {
                reportContainer.innerHTML = '<p style="text-align:center;">No records found.</p>';
                return;
            }

            data.data.forEach(sessionGroup => {
                const sessionHeader = document.createElement('h5');
                sessionHeader.style.cssText = 'margin-top: 25px; padding-bottom: 5px; border-bottom: 2px solid var(--primary-color); display: flex; justify-content: space-between; align-items: center;';
                
                const title = document.createElement('span');
                title.textContent = `Session: ${sessionGroup._id} (${sessionGroup.course})`;

                const countBadge = document.createElement('span');
                countBadge.style.cssText = 'background: var(--secondary-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.9rem;';
                countBadge.textContent = `Present: ${sessionGroup.count}`;

                sessionHeader.appendChild(title);
                sessionHeader.appendChild(countBadge);
                reportContainer.appendChild(sessionHeader);

                const table = document.createElement('table');
                table.style.cssText = 'width:100%; text-align:left; border-collapse: collapse; margin-top: 10px;';
                
                thead = table.createTHead();
                thead.innerHTML = `
                    <tr style="background:#eee;">
                        <th style="padding:8px;">Student ID</th>
                        <th style="padding:8px;">Time</th>
                        <th style="padding:8px;">Class Time</th>
                        <th style="padding:8px;">Status</th>
                    </tr>
                `;

                const tbody = table.createTBody();
                sessionGroup.records.forEach(record => {
                    const timeStr = new Date(record.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const row = tbody.insertRow();
                    row.innerHTML = `
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${record.studentId}</td>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${timeStr}</td>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${record.timeSlot || sessionGroup.timeSlot || ''}</td>
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
