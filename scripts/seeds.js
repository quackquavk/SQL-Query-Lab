export const SEEDS = {
  hospital: `
    CREATE TABLE departments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      floor INTEGER
    );
    INSERT INTO departments VALUES
      (1,'Cardiology',3),
      (2,'Neurology',4),
      (3,'Pediatrics',2),
      (4,'Emergency',1),
      (5,'Oncology',5);

    CREATE TABLE doctors (
      id INTEGER PRIMARY KEY,
      first_name TEXT, last_name TEXT,
      specialty TEXT, department_id INTEGER,
      salary INTEGER, hire_date TEXT
    );
    INSERT INTO doctors VALUES
      (1,'Aanya','Shrestha','Cardiologist',1,195000,'2018-06-14'),
      (2,'Rohan','Tamang','Neurosurgeon',2,240000,'2016-11-02'),
      (3,'Meera','Gurung','Pediatrician',3,150000,'2020-01-20'),
      (4,'James','Okafor','ER Physician',4,172000,'2019-09-03'),
      (5,'Priya','Sharma','Oncologist',5,210000,'2015-04-11'),
      (6,'Lucas','Silva','Cardiologist',1,182000,'2021-07-22'),
      (7,'Yuki','Tanaka','Neurologist',2,198000,'2017-02-15'),
      (8,'Hassan','Farooq','Pediatrician',3,142000,'2022-03-10');

    CREATE TABLE patients (
      id INTEGER PRIMARY KEY,
      first_name TEXT, last_name TEXT,
      birth_date TEXT, blood_type TEXT,
      admission_date TEXT, discharge_date TEXT
    );
    INSERT INTO patients VALUES
      (1,'Emma','Thompson','1985-03-12','A+','2024-02-14','2024-02-18'),
      (2,'Raj','Patel','1972-11-08','O-','2024-02-15',NULL),
      (3,'Sofia','Romano','1990-07-25','B+','2024-02-10','2024-02-12'),
      (4,'Kai','Johnson','2005-01-30','AB+','2024-02-20',NULL),
      (5,'Noa','Fischer','1968-09-14','A-','2024-01-30','2024-02-05'),
      (6,'Liam','Wright','1995-12-03','O+','2024-02-22',NULL),
      (7,'Zara','Ali','1988-04-17','B-','2024-02-18','2024-02-21'),
      (8,'Thiago','Mendes','1979-08-29','AB-','2024-02-12','2024-02-16'),
      (9,'Aisha','Khan','2001-06-11','A+','2024-02-25',NULL),
      (10,'Felix','Berg','1955-02-28','O+','2024-02-08','2024-02-19');

    CREATE TABLE appointments (
      id INTEGER PRIMARY KEY,
      patient_id INTEGER, doctor_id INTEGER,
      appointment_date TEXT, status TEXT, notes TEXT
    );
    INSERT INTO appointments VALUES
      (1,1,1,'2024-02-14','completed','Routine checkup'),
      (2,2,1,'2024-02-15','completed','Chest pain eval'),
      (3,3,3,'2024-02-10','completed','Fever'),
      (4,4,4,'2024-02-20','completed','ER visit'),
      (5,5,5,'2024-01-30','completed','Chemo round 2'),
      (6,6,2,'2024-02-22','scheduled','Consultation'),
      (7,7,3,'2024-02-18','cancelled','Rescheduled'),
      (8,8,5,'2024-02-12','completed','Follow-up'),
      (9,9,1,'2024-02-25','scheduled','New patient'),
      (10,10,5,'2024-02-08','completed','Biopsy'),
      (11,1,6,'2024-03-01','scheduled','Second opinion'),
      (12,2,6,'2024-03-05','scheduled','Stress test'),
      (13,3,8,'2024-03-02','cancelled','Patient no-show');
  `,

  company: `
    CREATE TABLE departments (
      id INTEGER PRIMARY KEY, name TEXT, budget INTEGER
    );
    INSERT INTO departments VALUES
      (1,'Engineering',4800000),
      (2,'Sales',2400000),
      (3,'Marketing',1600000),
      (4,'Finance',1200000),
      (5,'HR',800000);

    CREATE TABLE employees (
      id INTEGER PRIMARY KEY,
      first_name TEXT, last_name TEXT, email TEXT,
      department_id INTEGER, salary INTEGER,
      hire_date TEXT, manager_id INTEGER
    );
    INSERT INTO employees VALUES
      (1,'Alexandra','Chen','alex.chen@co.com',1,185000,'2014-03-15',NULL),
      (2,'Marcus','Bauer','m.bauer@co.com',1,135000,'2016-08-22',1),
      (3,'Sana','Iqbal','s.iqbal@co.com',1,142000,'2017-01-09',1),
      (4,'Ravi','Venkat','r.venkat@co.com',1,118000,'2019-06-14',2),
      (5,'Emma','Lindqvist','e.lindqvist@co.com',1,96000,'2021-11-01',2),
      (6,'Daniel','Osei','d.osei@co.com',2,165000,'2015-05-10',NULL),
      (7,'Yuna','Park','y.park@co.com',2,110000,'2018-09-20',6),
      (8,'Olivia','Walsh','o.walsh@co.com',2,98000,'2020-02-12',6),
      (9,'Hiroshi','Sato','h.sato@co.com',3,128000,'2016-04-03',NULL),
      (10,'Clara','Dubois','c.dubois@co.com',3,92000,'2019-08-17',9),
      (11,'Omar','Nasir','o.nasir@co.com',4,155000,'2013-10-30',NULL),
      (12,'Grace','Okonkwo','g.okonkwo@co.com',4,112000,'2020-03-24',11),
      (13,'Leo','Abramov','l.abramov@co.com',5,108000,'2017-07-11',NULL);

    CREATE TABLE projects (
      id INTEGER PRIMARY KEY, name TEXT,
      start_date TEXT, end_date TEXT, budget INTEGER
    );
    INSERT INTO projects VALUES
      (1,'Aurora Platform','2023-01-10','2024-06-30',1200000),
      (2,'Blue River Mobile','2023-04-01','2024-03-15',650000),
      (3,'Copper Pipeline','2023-07-15','2024-09-30',820000),
      (4,'Delta Rebrand','2023-09-01','2024-02-28',290000),
      (5,'Eagle Compliance','2024-01-15','2024-12-31',470000);

    CREATE TABLE assignments (
      employee_id INTEGER, project_id INTEGER,
      role TEXT, hours INTEGER,
      PRIMARY KEY(employee_id, project_id)
    );
    INSERT INTO assignments VALUES
      (2,1,'Tech Lead',800),
      (3,1,'Architect',720),
      (4,1,'Engineer',900),
      (5,2,'Engineer',640),
      (4,2,'Engineer',480),
      (2,3,'Tech Lead',560),
      (3,3,'Architect',400),
      (9,4,'Creative Lead',320),
      (10,4,'Designer',480),
      (11,5,'Finance Lead',200),
      (12,5,'Analyst',280);
  `,

  school: `
    CREATE TABLE teachers (
      id INTEGER PRIMARY KEY,
      first_name TEXT, last_name TEXT,
      subject TEXT, years_experience INTEGER
    );
    INSERT INTO teachers VALUES
      (1,'Anjali','Desai','Mathematics',14),
      (2,'Benjamin','Wolf','History',22),
      (3,'Chiamaka','Obi','Biology',9),
      (4,'Dmitri','Popov','Physics',17),
      (5,'Elena','Vasquez','Literature',11);

    CREATE TABLE students (
      id INTEGER PRIMARY KEY,
      first_name TEXT, last_name TEXT,
      grade INTEGER, enrollment_date TEXT, gpa REAL
    );
    INSERT INTO students VALUES
      (1,'Aarav','Malhotra',10,'2022-08-20',3.8),
      (2,'Beatrice','Klein',11,'2021-08-22',3.5),
      (3,'Camila','Reyes',10,'2022-08-20',3.9),
      (4,'Dante','Russo',12,'2020-08-19',3.2),
      (5,'Eva','Nikolova',9,'2023-08-21',3.7),
      (6,'Finn','O''Brien',11,'2021-08-22',3.4),
      (7,'Gia','Tran',12,'2020-08-19',3.95),
      (8,'Hector','Martinez',9,'2023-08-21',3.1),
      (9,'Iris','Yamamoto',10,'2022-08-20',3.6),
      (10,'Jaden','Williams',11,'2021-08-22',2.9);

    CREATE TABLE courses (
      id INTEGER PRIMARY KEY,
      title TEXT, credits INTEGER, teacher_id INTEGER
    );
    INSERT INTO courses VALUES
      (1,'Algebra II',4,1),
      (2,'Calculus',5,1),
      (3,'World History',3,2),
      (4,'European History',3,2),
      (5,'Biology',4,3),
      (6,'Physics',4,4),
      (7,'English Literature',3,5);

    CREATE TABLE enrollments (
      student_id INTEGER, course_id INTEGER,
      grade TEXT, term TEXT,
      PRIMARY KEY(student_id, course_id, term)
    );
    INSERT INTO enrollments VALUES
      (1,1,'A','Fall 2023'),
      (1,5,'A-','Fall 2023'),
      (2,2,'B+','Fall 2023'),
      (2,6,'B','Fall 2023'),
      (3,1,'A','Fall 2023'),
      (3,7,'A','Fall 2023'),
      (4,2,'C+','Fall 2023'),
      (4,4,'B-','Fall 2023'),
      (5,1,'A-','Fall 2023'),
      (6,3,'B','Fall 2023'),
      (6,6,'B+','Fall 2023'),
      (7,2,'A','Fall 2023'),
      (7,7,'A','Fall 2023'),
      (8,5,'C','Fall 2023'),
      (9,1,'B+','Fall 2023'),
      (10,3,'C-','Fall 2023');
  `
};
