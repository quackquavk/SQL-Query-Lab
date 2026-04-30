export const QUESTIONS = [
  /* ─── HOSPITAL ─────────────────────────────── */
  {
    id: 1, db: 'hospital', category: 'SELECT', difficulty: 'easy',
    title: 'All patients',
    prompt: 'Retrieve every row and every column from the <code>patients</code> table.',
    hint: 'The simplest form of SELECT. Use * to grab all columns.',
    validationType: 'result',
    referenceQuery: 'SELECT * FROM patients'
  },
  {
    id: 2, db: 'hospital', category: 'SELECT', difficulty: 'easy',
    title: 'Cardiologists only',
    prompt: 'From the <code>doctors</code> table, return the first name, last name, and salary of every doctor whose specialty is exactly <code>Cardiologist</code>.',
    hint: 'WHERE specialty = \'Cardiologist\' — remember string literals use single quotes in SQL.',
    validationType: 'result',
    referenceQuery: "SELECT first_name, last_name, salary FROM doctors WHERE specialty = 'Cardiologist'"
  },
  {
    id: 3, db: 'hospital', category: 'SELECT', difficulty: 'easy',
    title: 'Patients still admitted',
    prompt: 'Return the <code>id</code>, <code>first_name</code>, and <code>last_name</code> of every patient who has <strong>not yet been discharged</strong> (i.e. <code>discharge_date</code> is NULL).',
    hint: 'Use IS NULL — not = NULL. Comparing anything to NULL with = always yields UNKNOWN.',
    validationType: 'result',
    referenceQuery: 'SELECT id, first_name, last_name FROM patients WHERE discharge_date IS NULL'
  },
  {
    id: 4, db: 'hospital', category: 'SELECT', difficulty: 'easy',
    title: 'Count of appointments',
    prompt: 'Return a single row with a single column named <code>total</code> containing the total number of appointments in the system.',
    hint: 'COUNT(*) gives row counts. Use an alias like AS total.',
    validationType: 'result',
    referenceQuery: 'SELECT COUNT(*) AS total FROM appointments'
  },
  {
    id: 5, db: 'hospital', category: 'SELECT', difficulty: 'medium',
    title: 'Appointments with doctor names',
    prompt: 'For every appointment, show the appointment <code>id</code>, the appointment <code>status</code>, and the doctor\'s <code>first_name</code> and <code>last_name</code>. Order by appointment id ascending.',
    hint: 'You need a JOIN between appointments and doctors on doctor_id = doctors.id.',
    validationType: 'result',
    referenceQuery: `SELECT a.id, a.status, d.first_name, d.last_name
                     FROM appointments a
                     JOIN doctors d ON a.doctor_id = d.id
                     ORDER BY a.id`
  },
  {
    id: 6, db: 'hospital', category: 'SELECT', difficulty: 'medium',
    title: 'Doctors per department',
    prompt: 'For every department, return the department <code>name</code> and the number of doctors it has, aliased as <code>doctor_count</code>. Include departments that have zero doctors. Order by <code>doctor_count</code> DESC, then by department name ASC.',
    hint: 'LEFT JOIN is needed so departments with no doctors still appear. GROUP BY the department.',
    validationType: 'result',
    referenceQuery: `SELECT dep.name, COUNT(d.id) AS doctor_count
                     FROM departments dep
                     LEFT JOIN doctors d ON d.department_id = dep.id
                     GROUP BY dep.id, dep.name
                     ORDER BY doctor_count DESC, dep.name ASC`
  },
  {
    id: 7, db: 'hospital', category: 'SELECT', difficulty: 'hard',
    title: 'Top earner per department',
    prompt: 'Return one row per department showing the department <code>name</code>, and the <code>first_name</code>, <code>last_name</code>, and <code>salary</code> of the <strong>highest-paid doctor</strong> in that department. Ignore departments with no doctors. Order results by department name.',
    hint: 'Classic "top-N per group" problem. A correlated subquery in WHERE works: WHERE salary = (SELECT MAX(salary) FROM doctors WHERE department_id = d.department_id).',
    validationType: 'result',
    referenceQuery: `SELECT dep.name, d.first_name, d.last_name, d.salary
                     FROM doctors d
                     JOIN departments dep ON dep.id = d.department_id
                     WHERE d.salary = (
                       SELECT MAX(salary) FROM doctors WHERE department_id = d.department_id
                     )
                     ORDER BY dep.name`
  },
  {
    id: 8, db: 'hospital', category: 'INSERT', difficulty: 'easy',
    title: 'Admit a new patient',
    prompt: 'Insert a new patient into the <code>patients</code> table with id <code>11</code>, first name <code>Theo</code>, last name <code>Hansen</code>, birth date <code>1993-05-18</code>, blood type <code>O+</code>, admission date <code>2024-02-28</code>, and NULL discharge_date.',
    hint: 'INSERT INTO patients VALUES (...) — include all 7 columns in table order.',
    validationType: 'state',
    setupQuery: null,
    referenceQuery: `INSERT INTO patients VALUES (11,'Theo','Hansen','1993-05-18','O+','2024-02-28',NULL)`,
    verificationQuery: 'SELECT * FROM patients WHERE id = 11'
  },
  {
    id: 9, db: 'hospital', category: 'INSERT', difficulty: 'medium',
    title: 'Insert only selected columns',
    prompt: 'Insert a new department row where <code>id</code> = 6 and <code>name</code> = <code>Radiology</code>. Do not specify a value for <code>floor</code> (let it remain NULL).',
    hint: 'Use the column-list syntax: INSERT INTO departments (id, name) VALUES (...).',
    validationType: 'state',
    referenceQuery: `INSERT INTO departments (id, name) VALUES (6, 'Radiology')`,
    verificationQuery: 'SELECT id, name, floor FROM departments WHERE id = 6'
  },
  {
    id: 10, db: 'hospital', category: 'INSERT', difficulty: 'hard',
    title: 'Copy cancelled appointments',
    prompt: `First create a table <code>cancelled_log(appointment_id INTEGER, patient_id INTEGER, doctor_id INTEGER)</code>, then copy every appointment whose status is <code>cancelled</code> into it using <code>INSERT ... SELECT</code>. Your final output (when we SELECT * FROM cancelled_log ORDER BY appointment_id) should match the reference.`,
    hint: 'Two statements: CREATE TABLE ...; then INSERT INTO cancelled_log (...) SELECT id, patient_id, doctor_id FROM appointments WHERE status=\'cancelled\';',
    validationType: 'state',
    referenceQuery: `CREATE TABLE cancelled_log(appointment_id INTEGER, patient_id INTEGER, doctor_id INTEGER);
                     INSERT INTO cancelled_log (appointment_id, patient_id, doctor_id)
                     SELECT id, patient_id, doctor_id FROM appointments WHERE status='cancelled'`,
    verificationQuery: 'SELECT * FROM cancelled_log ORDER BY appointment_id'
  },
  {
    id: 11, db: 'hospital', category: 'UPDATE', difficulty: 'easy',
    title: 'Promote a doctor',
    prompt: 'Raise the salary of the doctor with id <code>3</code> to <code>165000</code>.',
    hint: 'UPDATE doctors SET salary = 165000 WHERE id = 3;',
    validationType: 'state',
    referenceQuery: 'UPDATE doctors SET salary = 165000 WHERE id = 3',
    verificationQuery: 'SELECT id, salary FROM doctors WHERE id = 3'
  },
  {
    id: 12, db: 'hospital', category: 'UPDATE', difficulty: 'medium',
    title: 'Discharge all current patients',
    prompt: 'For every patient whose <code>discharge_date</code> is currently NULL, set their discharge_date to <code>2024-03-01</code>.',
    hint: 'UPDATE patients SET discharge_date = \'2024-03-01\' WHERE discharge_date IS NULL;',
    validationType: 'state',
    referenceQuery: "UPDATE patients SET discharge_date = '2024-03-01' WHERE discharge_date IS NULL",
    verificationQuery: 'SELECT id, discharge_date FROM patients ORDER BY id'
  },
  {
    id: 13, db: 'hospital', category: 'UPDATE', difficulty: 'hard',
    title: 'Reassign cardiology patients',
    prompt: `Change the status to <code>rescheduled</code> for every appointment that was <code>scheduled</code> AND whose doctor works in the <code>Cardiology</code> department.`,
    hint: 'You can use UPDATE with a subquery: WHERE doctor_id IN (SELECT id FROM doctors WHERE department_id = (SELECT id FROM departments WHERE name=\'Cardiology\'))',
    validationType: 'state',
    referenceQuery: `UPDATE appointments SET status = 'rescheduled'
                     WHERE status = 'scheduled'
                     AND doctor_id IN (
                       SELECT id FROM doctors
                       WHERE department_id = (SELECT id FROM departments WHERE name='Cardiology')
                     )`,
    verificationQuery: 'SELECT id, status FROM appointments ORDER BY id'
  },
  {
    id: 14, db: 'hospital', category: 'DELETE', difficulty: 'easy',
    title: 'Remove cancelled appointments',
    prompt: 'Delete every appointment whose <code>status</code> is <code>cancelled</code>.',
    hint: 'DELETE FROM appointments WHERE status = \'cancelled\';',
    validationType: 'state',
    referenceQuery: "DELETE FROM appointments WHERE status='cancelled'",
    verificationQuery: 'SELECT id, status FROM appointments ORDER BY id'
  },
  {
    id: 15, db: 'hospital', category: 'DELETE', difficulty: 'medium',
    title: 'Purge discharged patients older than February 15',
    prompt: 'Delete every patient who has been discharged (discharge_date IS NOT NULL) AND whose <code>discharge_date</code> is before <code>2024-02-15</code>.',
    hint: 'Dates stored as ISO strings compare correctly: WHERE discharge_date < \'2024-02-15\'. Remember IS NOT NULL.',
    validationType: 'state',
    referenceQuery: "DELETE FROM patients WHERE discharge_date IS NOT NULL AND discharge_date < '2024-02-15'",
    verificationQuery: 'SELECT id FROM patients ORDER BY id'
  },
  {
    id: 16, db: 'hospital', category: 'DDL', difficulty: 'easy',
    title: 'Add a phone column',
    prompt: 'Add a new column <code>phone</code> of type <code>TEXT</code> to the <code>patients</code> table.',
    hint: 'ALTER TABLE patients ADD COLUMN phone TEXT;',
    validationType: 'state',
    referenceQuery: 'ALTER TABLE patients ADD COLUMN phone TEXT',
    verificationQuery: "SELECT name, type FROM pragma_table_info('patients') ORDER BY cid"
  },
  {
    id: 17, db: 'hospital', category: 'DDL', difficulty: 'medium',
    title: 'Create an audit table',
    prompt: 'Create a new table <code>audit_log</code> with three columns: <code>id</code> INTEGER PRIMARY KEY, <code>action</code> TEXT NOT NULL, and <code>timestamp</code> TEXT.',
    hint: 'CREATE TABLE audit_log (id INTEGER PRIMARY KEY, action TEXT NOT NULL, timestamp TEXT);',
    validationType: 'state',
    referenceQuery: 'CREATE TABLE audit_log (id INTEGER PRIMARY KEY, action TEXT NOT NULL, timestamp TEXT)',
    verificationQuery: "SELECT name, type, \"notnull\", pk FROM pragma_table_info('audit_log') ORDER BY cid"
  },
  {
    id: 18, db: 'hospital', category: 'DDL', difficulty: 'medium',
    title: 'Drop a table',
    prompt: 'The <code>appointments</code> table is being retired. Drop it from the database.',
    hint: 'DROP TABLE appointments;',
    validationType: 'state',
    referenceQuery: 'DROP TABLE appointments',
    verificationQuery: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  },

  /* ─── COMPANY ─────────────────────────────── */
  {
    id: 19, db: 'company', category: 'SELECT', difficulty: 'easy',
    title: 'Employees in Engineering',
    prompt: 'Return the <code>first_name</code>, <code>last_name</code>, and <code>salary</code> of every employee in the <strong>Engineering</strong> department (department_id 1).',
    hint: 'WHERE department_id = 1.',
    validationType: 'result',
    referenceQuery: 'SELECT first_name, last_name, salary FROM employees WHERE department_id = 1'
  },
  {
    id: 20, db: 'company', category: 'SELECT', difficulty: 'easy',
    title: 'Salary range',
    prompt: 'Return a single row with two columns: <code>min_salary</code> (the smallest salary) and <code>max_salary</code> (the largest) in the company.',
    hint: 'Use MIN() and MAX() with aliases.',
    validationType: 'result',
    referenceQuery: 'SELECT MIN(salary) AS min_salary, MAX(salary) AS max_salary FROM employees'
  },
  {
    id: 21, db: 'company', category: 'SELECT', difficulty: 'medium',
    title: 'Average salary by department',
    prompt: 'Return the department <code>name</code> and the average salary of its employees (aliased <code>avg_salary</code>, rounded to the nearest integer). Order by avg_salary DESC.',
    hint: 'JOIN + GROUP BY + ROUND(AVG(salary)).',
    validationType: 'result',
    referenceQuery: `SELECT d.name, ROUND(AVG(e.salary)) AS avg_salary
                     FROM employees e
                     JOIN departments d ON d.id = e.department_id
                     GROUP BY d.id, d.name
                     ORDER BY avg_salary DESC`
  },
  {
    id: 22, db: 'company', category: 'SELECT', difficulty: 'medium',
    title: 'Employees earning above average',
    prompt: 'Return the <code>first_name</code>, <code>last_name</code>, and <code>salary</code> of every employee whose salary is strictly greater than the company-wide average salary. Order by salary DESC.',
    hint: 'Use a scalar subquery: WHERE salary > (SELECT AVG(salary) FROM employees).',
    validationType: 'result',
    referenceQuery: `SELECT first_name, last_name, salary FROM employees
                     WHERE salary > (SELECT AVG(salary) FROM employees)
                     ORDER BY salary DESC`
  },
  {
    id: 23, db: 'company', category: 'SELECT', difficulty: 'hard',
    title: 'Managers and their report counts',
    prompt: 'For every employee who is a manager (i.e. appears as someone\'s <code>manager_id</code>), return the manager\'s <code>first_name</code>, <code>last_name</code>, and the number of direct reports as <code>report_count</code>. Order by report_count DESC, then manager last_name ASC.',
    hint: 'Self-join: employees e JOIN employees r ON r.manager_id = e.id, then GROUP BY manager.',
    validationType: 'result',
    referenceQuery: `SELECT e.first_name, e.last_name, COUNT(r.id) AS report_count
                     FROM employees e
                     JOIN employees r ON r.manager_id = e.id
                     GROUP BY e.id, e.first_name, e.last_name
                     ORDER BY report_count DESC, e.last_name ASC`
  },
  {
    id: 24, db: 'company', category: 'INSERT', difficulty: 'easy',
    title: 'Hire a new engineer',
    prompt: `Insert a new employee: id=14, first_name <code>Sophie</code>, last_name <code>Aalto</code>, email <code>s.aalto@co.com</code>, department_id 1, salary 112000, hire_date <code>2024-03-01</code>, manager_id 1.`,
    hint: 'INSERT INTO employees VALUES (14, \'Sophie\', ...).',
    validationType: 'state',
    referenceQuery: `INSERT INTO employees VALUES (14,'Sophie','Aalto','s.aalto@co.com',1,112000,'2024-03-01',1)`,
    verificationQuery: 'SELECT * FROM employees WHERE id = 14'
  },
  {
    id: 25, db: 'company', category: 'UPDATE', difficulty: 'medium',
    title: '5% raise for Engineering',
    prompt: 'Give every employee in the Engineering department (department_id 1) a 5% salary raise. Round the result to the nearest integer and store it back in <code>salary</code>.',
    hint: 'UPDATE employees SET salary = ROUND(salary * 1.05) WHERE department_id = 1;',
    validationType: 'state',
    referenceQuery: 'UPDATE employees SET salary = ROUND(salary * 1.05) WHERE department_id = 1',
    verificationQuery: 'SELECT id, salary FROM employees ORDER BY id'
  },
  {
    id: 26, db: 'company', category: 'UPDATE', difficulty: 'hard',
    title: 'Normalize email domains',
    prompt: 'Every email currently ends with <code>@co.com</code>. Update all employees so their emails end with <code>@company.com</code> instead, keeping the local part the same.',
    hint: 'Use REPLACE(email, \'@co.com\', \'@company.com\') in SET.',
    validationType: 'state',
    referenceQuery: "UPDATE employees SET email = REPLACE(email, '@co.com', '@company.com')",
    verificationQuery: 'SELECT id, email FROM employees ORDER BY id'
  },
  {
    id: 27, db: 'company', category: 'DELETE', difficulty: 'medium',
    title: 'Remove inactive projects',
    prompt: 'Delete every project whose <code>end_date</code> is before <code>2024-04-01</code>.',
    hint: 'DELETE FROM projects WHERE end_date < \'2024-04-01\';',
    validationType: 'state',
    referenceQuery: "DELETE FROM projects WHERE end_date < '2024-04-01'",
    verificationQuery: 'SELECT id, name, end_date FROM projects ORDER BY id'
  },
  {
    id: 28, db: 'company', category: 'DELETE', difficulty: 'hard',
    title: 'Remove orphan assignments',
    prompt: 'Delete every row from <code>assignments</code> where the <code>project_id</code> refers to a project that does not exist in the <code>projects</code> table. (Run this <em>after</em> projects have been removed — pretend some were already deleted.)',
    hint: 'DELETE FROM assignments WHERE project_id NOT IN (SELECT id FROM projects);',
    validationType: 'state',
    setupQuery: "DELETE FROM projects WHERE id IN (3,4)",
    referenceQuery: 'DELETE FROM assignments WHERE project_id NOT IN (SELECT id FROM projects)',
    verificationQuery: 'SELECT employee_id, project_id FROM assignments ORDER BY employee_id, project_id'
  },
  {
    id: 29, db: 'company', category: 'DDL', difficulty: 'medium',
    title: 'Create an index',
    prompt: 'Create an index named <code>idx_employees_dept</code> on the <code>department_id</code> column of the <code>employees</code> table.',
    hint: 'CREATE INDEX idx_employees_dept ON employees(department_id);',
    validationType: 'state',
    referenceQuery: 'CREATE INDEX idx_employees_dept ON employees(department_id)',
    verificationQuery: "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name='idx_employees_dept'"
  },
  {
    id: 30, db: 'company', category: 'DDL', difficulty: 'hard',
    title: 'Create a view of high earners',
    prompt: 'Create a <strong>view</strong> named <code>high_earners</code> that exposes the id, first_name, last_name, and salary of every employee whose salary is at least 150000.',
    hint: 'CREATE VIEW high_earners AS SELECT id, first_name, last_name, salary FROM employees WHERE salary >= 150000;',
    validationType: 'state',
    referenceQuery: 'CREATE VIEW high_earners AS SELECT id, first_name, last_name, salary FROM employees WHERE salary >= 150000',
    verificationQuery: 'SELECT * FROM high_earners ORDER BY id'
  },

  /* ─── SCHOOL ─────────────────────────────── */
  {
    id: 31, db: 'school', category: 'SELECT', difficulty: 'easy',
    title: '10th graders',
    prompt: 'Return every column from <code>students</code> for students in the 10th grade. Order by <code>id</code>.',
    hint: 'WHERE grade = 10 ORDER BY id.',
    validationType: 'result',
    referenceQuery: 'SELECT * FROM students WHERE grade = 10 ORDER BY id'
  },
  {
    id: 32, db: 'school', category: 'SELECT', difficulty: 'medium',
    title: 'Students and their course count',
    prompt: 'For every student, return <code>first_name</code>, <code>last_name</code>, and the total number of courses they\'re enrolled in (aliased <code>num_courses</code>). Include students with zero enrollments. Order by num_courses DESC, then last_name ASC.',
    hint: 'LEFT JOIN enrollments, GROUP BY student.',
    validationType: 'result',
    referenceQuery: `SELECT s.first_name, s.last_name, COUNT(e.course_id) AS num_courses
                     FROM students s
                     LEFT JOIN enrollments e ON e.student_id = s.id
                     GROUP BY s.id, s.first_name, s.last_name
                     ORDER BY num_courses DESC, s.last_name ASC`
  },
  {
    id: 33, db: 'school', category: 'SELECT', difficulty: 'hard',
    title: 'Perfect-A students',
    prompt: 'Return the <code>first_name</code> and <code>last_name</code> of every student who received an <code>A</code> (exactly "A", not "A-") in <strong>every</strong> course they\'re enrolled in. Exclude students with zero enrollments. Order by last_name.',
    hint: 'HAVING COUNT(*) = SUM(CASE WHEN grade=\'A\' THEN 1 ELSE 0 END).',
    validationType: 'result',
    referenceQuery: `SELECT s.first_name, s.last_name
                     FROM students s
                     JOIN enrollments e ON e.student_id = s.id
                     GROUP BY s.id, s.first_name, s.last_name
                     HAVING COUNT(*) = SUM(CASE WHEN e.grade='A' THEN 1 ELSE 0 END)
                     ORDER BY s.last_name`
  },
  {
    id: 34, db: 'school', category: 'INSERT', difficulty: 'medium',
    title: 'Enroll a student in multiple courses',
    prompt: 'Enroll student id 5 in courses 2 and 7 for term <code>Spring 2024</code> with grade <code>NULL</code>. Use a single multi-row INSERT.',
    hint: 'INSERT INTO enrollments VALUES (5,2,NULL,\'Spring 2024\'), (5,7,NULL,\'Spring 2024\');',
    validationType: 'state',
    referenceQuery: "INSERT INTO enrollments VALUES (5,2,NULL,'Spring 2024'),(5,7,NULL,'Spring 2024')",
    verificationQuery: "SELECT student_id, course_id, grade, term FROM enrollments WHERE term='Spring 2024' ORDER BY course_id"
  },
  {
    id: 35, db: 'school', category: 'UPDATE', difficulty: 'medium',
    title: 'Promote all students',
    prompt: 'Increment every student\'s <code>grade</code> by 1 (a new school year has begun).',
    hint: 'UPDATE students SET grade = grade + 1;',
    validationType: 'state',
    referenceQuery: 'UPDATE students SET grade = grade + 1',
    verificationQuery: 'SELECT id, grade FROM students ORDER BY id'
  },
  {
    id: 36, db: 'school', category: 'DELETE', difficulty: 'medium',
    title: 'Remove failing enrollments',
    prompt: 'Delete every enrollment whose <code>grade</code> starts with the letter <code>C</code> (C+, C, C-).',
    hint: 'DELETE FROM enrollments WHERE grade LIKE \'C%\';',
    validationType: 'state',
    referenceQuery: "DELETE FROM enrollments WHERE grade LIKE 'C%'",
    verificationQuery: 'SELECT student_id, course_id, grade FROM enrollments ORDER BY student_id, course_id'
  },
  {
    id: 37, db: 'school', category: 'DDL', difficulty: 'easy',
    title: 'Rename a table',
    prompt: 'Rename the <code>teachers</code> table to <code>faculty</code>.',
    hint: 'ALTER TABLE teachers RENAME TO faculty;',
    validationType: 'state',
    referenceQuery: 'ALTER TABLE teachers RENAME TO faculty',
    verificationQuery: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  },
  {
    id: 38, db: 'school', category: 'DDL', difficulty: 'hard',
    title: 'Composite primary key table',
    prompt: 'Create a table <code>attendance</code> with columns <code>student_id</code> INTEGER, <code>course_id</code> INTEGER, <code>date</code> TEXT, <code>present</code> INTEGER — and a composite PRIMARY KEY over all three of (student_id, course_id, date).',
    hint: 'Put PRIMARY KEY (student_id, course_id, date) as a table-level constraint.',
    validationType: 'state',
    referenceQuery: `CREATE TABLE attendance (
                       student_id INTEGER,
                       course_id INTEGER,
                       date TEXT,
                       present INTEGER,
                       PRIMARY KEY (student_id, course_id, date)
                     )`,
    verificationQuery: "SELECT name, type, pk FROM pragma_table_info('attendance') ORDER BY cid"
  },

  /* ═══ Expanded bank: SELECT variants, window functions, CTEs ═══ */

  {
    id: 39, db: 'hospital', category: 'SELECT', difficulty: 'easy',
    title: 'Distinct blood types',
    prompt: 'Return every distinct <code>blood_type</code> that appears in <code>patients</code>, sorted alphabetically.',
    hint: 'SELECT DISTINCT blood_type FROM patients ORDER BY blood_type;',
    validationType: 'result',
    referenceQuery: 'SELECT DISTINCT blood_type FROM patients ORDER BY blood_type'
  },
  {
    id: 40, db: 'hospital', category: 'SELECT', difficulty: 'easy',
    title: 'Top 3 highest-paid doctors',
    prompt: 'Return the <code>first_name</code>, <code>last_name</code>, and <code>salary</code> of the three highest-paid doctors, salary first.',
    hint: 'ORDER BY salary DESC then LIMIT 3.',
    validationType: 'result',
    referenceQuery: 'SELECT first_name, last_name, salary FROM doctors ORDER BY salary DESC LIMIT 3'
  },
  {
    id: 41, db: 'hospital', category: 'SELECT', difficulty: 'easy',
    title: 'Names starting with A',
    prompt: 'Return the <code>first_name</code> and <code>last_name</code> of every patient whose <strong>first name starts with the letter A</strong>. Order by first_name.',
    hint: "WHERE first_name LIKE 'A%' — the % is a wildcard.",
    validationType: 'result',
    referenceQuery: "SELECT first_name, last_name FROM patients WHERE first_name LIKE 'A%' ORDER BY first_name"
  },
  {
    id: 42, db: 'hospital', category: 'SELECT', difficulty: 'medium',
    title: 'Admissions in a date window',
    prompt: 'Return <code>id</code>, <code>first_name</code>, <code>last_name</code>, and <code>admission_date</code> for every patient admitted between <code>2024-02-15</code> and <code>2024-02-22</code>, inclusive. Order by admission_date, then id.',
    hint: "WHERE admission_date BETWEEN '2024-02-15' AND '2024-02-22' — BETWEEN is inclusive on both ends.",
    validationType: 'result',
    referenceQuery: "SELECT id, first_name, last_name, admission_date FROM patients WHERE admission_date BETWEEN '2024-02-15' AND '2024-02-22' ORDER BY admission_date, id"
  },
  {
    id: 43, db: 'hospital', category: 'SELECT', difficulty: 'medium',
    title: 'Bucket doctors by salary tier',
    prompt: "Return <code>first_name</code>, <code>last_name</code>, <code>salary</code>, and a computed column <code>tier</code> that is:<br>• <code>'senior'</code> if salary ≥ 200000<br>• <code>'mid'</code> if salary is 150000–199999<br>• <code>'junior'</code> otherwise.<br>Order by salary DESC.",
    hint: 'Use a CASE expression inside SELECT. Chain WHEN clauses from highest threshold down.',
    validationType: 'result',
    referenceQuery: `SELECT first_name, last_name, salary,
                       CASE WHEN salary >= 200000 THEN 'senior'
                            WHEN salary >= 150000 THEN 'mid'
                            ELSE 'junior' END AS tier
                     FROM doctors ORDER BY salary DESC`
  },
  {
    id: 44, db: 'hospital', category: 'SELECT', difficulty: 'medium',
    title: 'Handle NULL discharge dates',
    prompt: "Return <code>id</code>, <code>first_name</code>, <code>last_name</code>, and a column <code>status</code> that shows the discharge_date if it's set, or the literal string <code>'still admitted'</code> if it's NULL. Order by id.",
    hint: 'COALESCE(discharge_date, \'still admitted\') returns the first non-NULL value.',
    validationType: 'result',
    referenceQuery: "SELECT id, first_name, last_name, COALESCE(discharge_date, 'still admitted') AS status FROM patients ORDER BY id"
  },
  {
    id: 45, db: 'hospital', category: 'SELECT', difficulty: 'medium',
    title: 'Build full names',
    prompt: "Return a column <code>full_name</code> (first name, a single space, last name) and <code>blood_type</code> for every patient, ordered by id.",
    hint: "SQLite concatenates with || — e.g. first_name || ' ' || last_name.",
    validationType: 'result',
    referenceQuery: "SELECT first_name || ' ' || last_name AS full_name, blood_type FROM patients ORDER BY id"
  },
  {
    id: 46, db: 'hospital', category: 'SELECT', difficulty: 'hard',
    title: 'Three-table join',
    prompt: "For every appointment, show three columns: <code>patient</code> (full name of the patient), <code>doctor</code> (full name of the doctor), and <code>department</code> (the department name). Order by the appointment's id.",
    hint: 'You need three JOINs: appointments→patients, appointments→doctors, doctors→departments.',
    validationType: 'result',
    referenceQuery: `SELECT p.first_name || ' ' || p.last_name AS patient,
                            d.first_name || ' ' || d.last_name AS doctor,
                            dep.name AS department
                     FROM appointments a
                     JOIN patients p ON p.id = a.patient_id
                     JOIN doctors d ON d.id = a.doctor_id
                     JOIN departments dep ON dep.id = d.department_id
                     ORDER BY a.id`
  },
  {
    id: 47, db: 'hospital', category: 'SELECT', difficulty: 'hard',
    title: 'CTE: high-paying departments',
    prompt: "Using a <strong>common table expression (WITH clause)</strong>, compute the average doctor salary per department. Then return the department <code>name</code> and rounded <code>avg_salary</code> for those departments whose average exceeds 180000. Order by avg_salary DESC.",
    hint: 'WITH dept_avg AS ( … ) SELECT … FROM dept_avg JOIN departments …',
    validationType: 'result',
    referenceQuery: `WITH dept_avg AS (
                       SELECT department_id, AVG(salary) AS avg_sal FROM doctors GROUP BY department_id
                     )
                     SELECT dep.name, ROUND(da.avg_sal) AS avg_salary
                     FROM dept_avg da
                     JOIN departments dep ON dep.id = da.department_id
                     WHERE da.avg_sal > 180000
                     ORDER BY da.avg_sal DESC`
  },
  {
    id: 48, db: 'hospital', category: 'SELECT', difficulty: 'hard',
    title: 'Rank doctors within each department',
    prompt: "For every doctor, return <code>rank_in_dept</code>, <code>first_name</code>, <code>last_name</code>, <code>salary</code>, and <code>department_id</code>. The rank must reset per department, ordered by salary DESC (use id as a tie-breaker). Final order: department_id, rank_in_dept.",
    hint: 'ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC, id).',
    validationType: 'result',
    referenceQuery: `SELECT ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC, id) AS rank_in_dept,
                            first_name, last_name, salary, department_id
                     FROM doctors
                     ORDER BY department_id, rank_in_dept`
  },

  {
    id: 49, db: 'company', category: 'SELECT', difficulty: 'easy',
    title: 'Employees in specific departments',
    prompt: "Return <code>first_name</code>, <code>last_name</code>, and <code>department_id</code> for every employee in departments 1, 2, or 3. Order by id.",
    hint: 'WHERE department_id IN (1, 2, 3).',
    validationType: 'result',
    referenceQuery: 'SELECT first_name, last_name, department_id FROM employees WHERE department_id IN (1,2,3) ORDER BY id'
  },
  {
    id: 50, db: 'company', category: 'SELECT', difficulty: 'medium',
    title: 'Departments larger than 2',
    prompt: "Return department <code>name</code> and <code>headcount</code> (number of employees) for departments that have <strong>more than 2 employees</strong>. Order by headcount DESC, then name.",
    hint: 'GROUP BY department, filter aggregated counts with HAVING.',
    validationType: 'result',
    referenceQuery: `SELECT d.name, COUNT(e.id) AS headcount
                     FROM departments d JOIN employees e ON e.department_id = d.id
                     GROUP BY d.id, d.name
                     HAVING COUNT(e.id) > 2
                     ORDER BY headcount DESC, d.name`
  },
  {
    id: 51, db: 'company', category: 'SELECT', difficulty: 'medium',
    title: 'Employees with no assignments',
    prompt: "Return the <code>first_name</code> and <code>last_name</code> of every employee who is <strong>not assigned to any project</strong>. Order by id.",
    hint: 'WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE employee_id = e.id).',
    validationType: 'result',
    referenceQuery: `SELECT first_name, last_name FROM employees e
                     WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE employee_id = e.id)
                     ORDER BY e.id`
  },
  {
    id: 52, db: 'company', category: 'SELECT', difficulty: 'hard',
    title: 'Roster per department',
    prompt: "For each department, return the <code>name</code>, a comma-separated list of the member last names as <code>members</code> (joined with <code>', '</code>), and the department <code>headcount</code>. Order by department name.",
    hint: "GROUP_CONCAT(e.last_name, ', ') — the second arg is the separator.",
    validationType: 'result',
    referenceQuery: `SELECT d.name, GROUP_CONCAT(e.last_name, ', ') AS members, COUNT(*) AS headcount
                     FROM departments d JOIN employees e ON e.department_id = d.id
                     GROUP BY d.id, d.name
                     ORDER BY d.name`
  },
  {
    id: 53, db: 'company', category: 'SELECT', difficulty: 'hard',
    title: 'Overall salary ranking',
    prompt: "Return <code>salary_rank</code>, <code>first_name</code>, <code>last_name</code>, <code>salary</code> for every employee, ranked by salary DESC using <strong>RANK()</strong> (ties share a rank, next rank skips). Order by salary_rank, then last_name.",
    hint: 'RANK() OVER (ORDER BY salary DESC). RANK (not DENSE_RANK) skips after ties.',
    validationType: 'result',
    referenceQuery: `SELECT RANK() OVER (ORDER BY salary DESC) AS salary_rank,
                            first_name, last_name, salary
                     FROM employees
                     ORDER BY salary_rank, last_name`
  },
  {
    id: 54, db: 'company', category: 'SELECT', difficulty: 'hard',
    title: 'Running total of salaries by hire date',
    prompt: "Return <code>id</code>, <code>hire_date</code>, <code>salary</code>, and a column <code>running_total</code> that is the cumulative sum of salaries ordered by hire_date (break ties by id). Final order: hire_date, id.",
    hint: 'SUM(salary) OVER (ORDER BY hire_date, id) gives a running total.',
    validationType: 'result',
    referenceQuery: `SELECT id, hire_date, salary,
                            SUM(salary) OVER (ORDER BY hire_date, id) AS running_total
                     FROM employees
                     ORDER BY hire_date, id`
  },

  {
    id: 55, db: 'school', category: 'SELECT', difficulty: 'easy',
    title: 'Distinct grade levels',
    prompt: 'Return every distinct <code>grade</code> level that currently has a student, sorted ascending.',
    hint: 'SELECT DISTINCT grade FROM students ORDER BY grade;',
    validationType: 'result',
    referenceQuery: 'SELECT DISTINCT grade FROM students ORDER BY grade'
  },
  {
    id: 56, db: 'school', category: 'SELECT', difficulty: 'medium',
    title: 'Union of students and teachers',
    prompt: "Return one combined list of everyone at the school with three columns: <code>kind</code> (the literal <code>'student'</code> or <code>'teacher'</code>), <code>first_name</code>, <code>last_name</code>. Order by kind, then last_name.",
    hint: "Two SELECTs joined by UNION: SELECT 'student' AS kind, … UNION SELECT 'teacher', …",
    validationType: 'result',
    referenceQuery: `SELECT 'student' AS kind, first_name, last_name FROM students
                     UNION
                     SELECT 'teacher' AS kind, first_name, last_name FROM teachers
                     ORDER BY kind, last_name`
  },
  {
    id: 57, db: 'school', category: 'SELECT', difficulty: 'medium',
    title: 'GPA statistics per grade',
    prompt: "For each <code>grade</code> level, return <code>min_gpa</code>, <code>max_gpa</code>, <code>avg_gpa</code> (rounded to 2 decimals), and <code>student_count</code>. Order by grade ascending.",
    hint: 'ROUND(AVG(gpa), 2) lets you control decimal places.',
    validationType: 'result',
    referenceQuery: `SELECT grade,
                            MIN(gpa) AS min_gpa,
                            MAX(gpa) AS max_gpa,
                            ROUND(AVG(gpa), 2) AS avg_gpa,
                            COUNT(*) AS student_count
                     FROM students
                     GROUP BY grade
                     ORDER BY grade`
  },
  {
    id: 58, db: 'school', category: 'SELECT', difficulty: 'hard',
    title: 'Above-average GPA (within grade)',
    prompt: "Return <code>id</code>, <code>first_name</code>, <code>last_name</code>, <code>grade</code>, <code>gpa</code> for every student whose GPA is strictly greater than the average GPA <strong>of their own grade level</strong>. Order by grade, then gpa DESC.",
    hint: 'Correlated subquery: WHERE gpa > (SELECT AVG(gpa) FROM students WHERE grade = s.grade).',
    validationType: 'result',
    referenceQuery: `SELECT id, first_name, last_name, grade, gpa FROM students s
                     WHERE gpa > (SELECT AVG(gpa) FROM students WHERE grade = s.grade)
                     ORDER BY grade, gpa DESC`
  },
  {
    id: 59, db: 'school', category: 'SELECT', difficulty: 'hard',
    title: 'Top student per grade',
    prompt: "Return <code>id</code>, <code>first_name</code>, <code>last_name</code>, <code>grade</code>, <code>gpa</code> of the top-GPA student in each grade (tie-break by id ASC). One row per grade. Order by grade.",
    hint: 'CTE + ROW_NUMBER() OVER (PARTITION BY grade ORDER BY gpa DESC, id), then WHERE rn = 1.',
    validationType: 'result',
    referenceQuery: `WITH ranked AS (
                       SELECT id, first_name, last_name, grade, gpa,
                              ROW_NUMBER() OVER (PARTITION BY grade ORDER BY gpa DESC, id) AS rn
                       FROM students
                     )
                     SELECT id, first_name, last_name, grade, gpa
                     FROM ranked WHERE rn = 1
                     ORDER BY grade`
  },

  /* ─── More INSERT / UPDATE / DELETE / DDL ─── */

  {
    id: 60, db: 'hospital', category: 'INSERT', difficulty: 'medium',
    title: 'Open three new departments at once',
    prompt: 'Insert three rows into <code>departments</code> with a single INSERT statement: (6, Dermatology, floor 2), (7, Orthopedics, floor 3), (8, Psychiatry, floor 4).',
    hint: 'INSERT INTO departments VALUES (…), (…), (…); — multi-row VALUES.',
    validationType: 'state',
    referenceQuery: "INSERT INTO departments VALUES (6,'Dermatology',2),(7,'Orthopedics',3),(8,'Psychiatry',4)",
    verificationQuery: 'SELECT * FROM departments ORDER BY id'
  },
  {
    id: 61, db: 'company', category: 'INSERT', difficulty: 'medium',
    title: 'Archive senior employees',
    prompt: 'Create a new table <code>senior_employees(id INTEGER, first_name TEXT, last_name TEXT, salary INTEGER)</code>, then populate it via <code>INSERT ... SELECT</code> with every employee earning <strong>at least 150000</strong>.',
    hint: 'Two statements separated by a semicolon. Second uses INSERT INTO … SELECT … FROM employees WHERE salary >= 150000.',
    validationType: 'state',
    referenceQuery: `CREATE TABLE senior_employees (id INTEGER, first_name TEXT, last_name TEXT, salary INTEGER);
                     INSERT INTO senior_employees (id, first_name, last_name, salary)
                     SELECT id, first_name, last_name, salary FROM employees WHERE salary >= 150000`,
    verificationQuery: 'SELECT * FROM senior_employees ORDER BY id'
  },
  {
    id: 62, db: 'school', category: 'INSERT', difficulty: 'hard',
    title: 'Upsert an enrollment grade',
    prompt: 'Student 1 is already enrolled in course 1 for term <code>Fall 2023</code> with grade <code>A</code>. Use <strong>INSERT OR REPLACE</strong> to change that grade to <code>A+</code> without throwing a primary-key conflict.',
    hint: "INSERT OR REPLACE INTO enrollments VALUES (1, 1, 'A+', 'Fall 2023'); — REPLACE deletes the conflicting row and inserts the new one.",
    validationType: 'state',
    referenceQuery: "INSERT OR REPLACE INTO enrollments VALUES (1, 1, 'A+', 'Fall 2023')",
    verificationQuery: 'SELECT student_id, course_id, grade, term FROM enrollments WHERE student_id=1 AND course_id=1'
  },
  {
    id: 63, db: 'hospital', category: 'UPDATE', difficulty: 'medium',
    title: 'Update multiple columns',
    prompt: 'For patient id 2: change <code>blood_type</code> to <code>O+</code> and set <code>discharge_date</code> to <code>2024-02-28</code> in a single UPDATE.',
    hint: 'UPDATE patients SET blood_type=\'O+\', discharge_date=\'2024-02-28\' WHERE id=2;',
    validationType: 'state',
    referenceQuery: "UPDATE patients SET blood_type='O+', discharge_date='2024-02-28' WHERE id=2",
    verificationQuery: 'SELECT id, blood_type, discharge_date FROM patients WHERE id=2'
  },
  {
    id: 64, db: 'company', category: 'UPDATE', difficulty: 'hard',
    title: 'Tiered raises by department',
    prompt: 'Apply raises via a single UPDATE using a CASE expression: department 1 gets +8%, department 2 gets +5%, everyone else +3%. Round results to whole numbers.',
    hint: 'UPDATE employees SET salary = ROUND(salary * CASE WHEN department_id = 1 THEN 1.08 WHEN department_id = 2 THEN 1.05 ELSE 1.03 END);',
    validationType: 'state',
    referenceQuery: `UPDATE employees SET salary = ROUND(salary * CASE
                       WHEN department_id = 1 THEN 1.08
                       WHEN department_id = 2 THEN 1.05
                       ELSE 1.03
                     END)`,
    verificationQuery: 'SELECT id, department_id, salary FROM employees ORDER BY id'
  },
  {
    id: 65, db: 'school', category: 'UPDATE', difficulty: 'hard',
    title: 'Perfect GPA for straight-A students',
    prompt: "Set <code>gpa = 4.0</code> for every student whose grades in <em>every</em> enrollment are exactly <code>'A'</code> (not <code>A-</code>, not <code>A+</code>). Students with zero enrollments should not be affected.",
    hint: "Subquery in WHERE: SELECT student_id … GROUP BY student_id HAVING COUNT(*) = SUM(CASE WHEN grade='A' THEN 1 ELSE 0 END).",
    validationType: 'state',
    referenceQuery: `UPDATE students SET gpa = 4.0
                     WHERE id IN (
                       SELECT student_id FROM enrollments
                       GROUP BY student_id
                       HAVING COUNT(*) = SUM(CASE WHEN grade = 'A' THEN 1 ELSE 0 END)
                     )`,
    verificationQuery: 'SELECT id, gpa FROM students ORDER BY id'
  },

  {
    id: 66, db: 'hospital', category: 'DELETE', difficulty: 'medium',
    title: 'Cancel appointments for discharged patients',
    prompt: "Delete every row in <code>appointments</code> whose <code>patient_id</code> belongs to a patient who has already been discharged (<code>discharge_date IS NOT NULL</code>).",
    hint: 'DELETE FROM appointments WHERE patient_id IN (SELECT id FROM patients WHERE discharge_date IS NOT NULL);',
    validationType: 'state',
    referenceQuery: 'DELETE FROM appointments WHERE patient_id IN (SELECT id FROM patients WHERE discharge_date IS NOT NULL)',
    verificationQuery: 'SELECT id, patient_id FROM appointments ORDER BY id'
  },
  {
    id: 67, db: 'company', category: 'DELETE', difficulty: 'hard',
    title: 'Remove low-budget assignments',
    prompt: 'Delete every row in <code>assignments</code> whose <code>project_id</code> references a project with <code>budget &lt; 500000</code>.',
    hint: 'DELETE FROM assignments WHERE project_id IN (SELECT id FROM projects WHERE budget < 500000);',
    validationType: 'state',
    referenceQuery: 'DELETE FROM assignments WHERE project_id IN (SELECT id FROM projects WHERE budget < 500000)',
    verificationQuery: 'SELECT employee_id, project_id FROM assignments ORDER BY employee_id, project_id'
  },
  {
    id: 68, db: 'school', category: 'DELETE', difficulty: 'easy',
    title: 'Clear the enrollments table',
    prompt: 'Delete <strong>every row</strong> from <code>enrollments</code> (the table should remain but become empty).',
    hint: 'DELETE FROM enrollments; — with no WHERE it removes all rows, but keeps the table.',
    validationType: 'state',
    referenceQuery: 'DELETE FROM enrollments',
    verificationQuery: 'SELECT COUNT(*) AS remaining FROM enrollments'
  },

  {
    id: 69, db: 'hospital', category: 'DDL', difficulty: 'medium',
    title: 'Table with a CHECK constraint',
    prompt: 'Create a table <code>medications</code> with: <code>id</code> INTEGER PRIMARY KEY, <code>name</code> TEXT NOT NULL, <code>dosage_mg</code> INTEGER with a CHECK that it is greater than 0.',
    hint: 'CREATE TABLE medications (id INTEGER PRIMARY KEY, name TEXT NOT NULL, dosage_mg INTEGER CHECK (dosage_mg > 0));',
    validationType: 'state',
    referenceQuery: 'CREATE TABLE medications (id INTEGER PRIMARY KEY, name TEXT NOT NULL, dosage_mg INTEGER CHECK (dosage_mg > 0))',
    verificationQuery: "SELECT name, type, \"notnull\", pk FROM pragma_table_info('medications') ORDER BY cid"
  },
  {
    id: 70, db: 'company', category: 'DDL', difficulty: 'medium',
    title: 'Table with a foreign key',
    prompt: 'Create a table <code>bonus_payouts</code> with: <code>id</code> INTEGER PRIMARY KEY, <code>employee_id</code> INTEGER, <code>amount</code> INTEGER, <code>payout_date</code> TEXT — and a FOREIGN KEY on employee_id referencing <code>employees(id)</code>.',
    hint: 'Add FOREIGN KEY (employee_id) REFERENCES employees(id) as a table-level constraint at the end.',
    validationType: 'state',
    referenceQuery: `CREATE TABLE bonus_payouts (
                       id INTEGER PRIMARY KEY,
                       employee_id INTEGER,
                       amount INTEGER,
                       payout_date TEXT,
                       FOREIGN KEY (employee_id) REFERENCES employees(id)
                     )`,
    verificationQuery: "SELECT name FROM sqlite_master WHERE type='table' AND name='bonus_payouts'"
  },
  {
    id: 71, db: 'hospital', category: 'DDL', difficulty: 'medium',
    title: 'Unique index on department name',
    prompt: 'Create a <strong>UNIQUE</strong> index named <code>idx_dept_name</code> on the <code>name</code> column of <code>departments</code>.',
    hint: 'CREATE UNIQUE INDEX idx_dept_name ON departments(name);',
    validationType: 'state',
    referenceQuery: 'CREATE UNIQUE INDEX idx_dept_name ON departments(name)',
    verificationQuery: "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name='idx_dept_name'"
  },
  {
    id: 72, db: 'company', category: 'DDL', difficulty: 'hard',
    title: 'View with a join',
    prompt: 'Create a view <code>employee_directory</code> exposing: <code>id</code>, <code>full_name</code> (first + space + last), <code>department_name</code>, <code>salary</code>. Join employees with their department.',
    hint: 'CREATE VIEW employee_directory AS SELECT e.id, e.first_name || \' \' || e.last_name AS full_name, d.name AS department_name, e.salary FROM employees e JOIN departments d ON d.id = e.department_id;',
    validationType: 'state',
    referenceQuery: `CREATE VIEW employee_directory AS
                     SELECT e.id, e.first_name || ' ' || e.last_name AS full_name, d.name AS department_name, e.salary
                     FROM employees e JOIN departments d ON d.id = e.department_id`,
    verificationQuery: 'SELECT * FROM employee_directory ORDER BY id'
  },
  {
    id: 73, db: 'school', category: 'DDL', difficulty: 'medium',
    title: 'Drop an existing index',
    prompt: "An index <code>idx_student_grade</code> has already been created on <code>students(grade)</code>. Drop it.",
    hint: 'DROP INDEX idx_student_grade;',
    validationType: 'state',
    setupQuery: 'CREATE INDEX idx_student_grade ON students(grade)',
    referenceQuery: 'DROP INDEX idx_student_grade',
    verificationQuery: "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_student_grade'"
  },
  {
    id: 74, db: 'school', category: 'DDL', difficulty: 'hard',
    title: 'Rename a column',
    prompt: 'Rename the column <code>gpa</code> in the <code>students</code> table to <code>gpa_score</code>.',
    hint: 'ALTER TABLE students RENAME COLUMN gpa TO gpa_score;',
    validationType: 'state',
    referenceQuery: 'ALTER TABLE students RENAME COLUMN gpa TO gpa_score',
    verificationQuery: "SELECT name FROM pragma_table_info('students') ORDER BY cid"
  }
];
