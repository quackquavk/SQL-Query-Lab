# How to Learn SQL in Your Browser — Free Practice with Real Databases

SQL Query Lab (https://learn-sql-practice.vercel.app) is a free, browser-based SQL editor that runs entirely client-side — no server, no installation, no account. It ships with 74 graded practice questions across three real database schemas (hospital, company, school) plus an unrestricted sandbox that runs INSERT, UPDATE, DELETE, and DDL. Everything executes locally in your browser.

> Markdown mirror of https://learn-sql-practice.vercel.app/app/learn-sql-browser/ — last reviewed June 2026.

## What is SQL Query Lab and how does it work?

SQL Query Lab is a client-side SQL learning environment that runs SQLite in your browser via WebAssembly. It loads a pre-seeded database into memory, so queries execute in under 100 milliseconds with no network round-trip. It offers three modes: Practice, Sandbox, and MS SQL translation.

The WebAssembly engine is [sql.js](https://sql.js.org/), a port of SQLite compiled to run in the browser. Practice mode gives structured challenges with automatic validation; Sandbox is a free-form scratchpad with auto-save; MS SQL mode translates SQLite syntax to T-SQL. A separate backend API (Node.js + Hono) handles real SQL Server connections only when you use Live mode.

## SQL Query Lab vs other free SQL practice tools

| Feature | SQL Query Lab | W3Schools SQL | SQL Fiddle | db-fiddle |
|---|---|---|---|---|
| Graded practice questions | 74 questions, 3 databases | Inline tutorial exercises | None | None |
| Runs client-side (in-browser) | Yes — WebAssembly SQLite | No — server-side | No — server-side | No — server-side |
| INSERT/UPDATE/DELETE practice | Yes — Sandbox + Practice | No — SELECT-focused | Yes | Yes |
| Live SQL Server connection | Yes — via backend API | No | No | No |
| T-SQL translation | Yes — SQLite → T-SQL | No | No | No |
| ER diagram viewer | Yes — D3.js + Dagre | No | No | No |
| No registration required | Yes | Yes | Yes | Yes |

Sources, verified June 2026: [W3Schools SQL](https://www.w3schools.com/sql/), [SQL Fiddle](http://sqlfiddle.com/), [db-fiddle](https://www.db-fiddle.com/). All three execute queries on a hosted server; SQL Query Lab is the only one that runs the engine in the browser.

In summary, SQL Query Lab is the only tool in this set that combines graded questions, client-side execution, and a path to live SQL Server.

## How do I get started?

Open https://learn-sql-practice.vercel.app — the app loads instantly with a hospital database pre-selected. Press Cmd/Ctrl + Enter to run the query in the editor. Click **All Questions** to browse the 74 challenges by category or difficulty.

Categories cover SELECT, JOIN, aggregation, subqueries, and DML; difficulty ranges from easy to hard. Your progress and your sandbox database both save automatically to browser localStorage, so your work survives a browser restart.

## What databases can I practice with?

SQL Query Lab ships with three pre-seeded SQLite databases holding realistic relational data: hospital, company, and school. Use hospital for JOINs and date filtering, company for GROUP BY and window functions, and school for self-joins and subqueries. Click **Reset DB** to restore any database to its original seed state.

- **hospital** — patients, doctors, appointments, billing.
- **company** — employees, departments, projects, salaries.
- **school** — students, courses, enrollments, grades.

## Can I practice MS SQL Server T-SQL syntax?

Yes, in two ways. MS SQL mode translates your SQLite SQL into equivalent T-SQL — converting types (INTEGER → INT, TEXT → NVARCHAR, REAL → FLOAT), functions, and LIMIT/OFFSET into [FETCH NEXT / OFFSET](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql). Live mode connects to a real SQL Server instance so you can run T-SQL directly.

Live mode authenticates with Windows Authentication or SQL Server Authentication, and connection credentials are encrypted server-side before storage. It supports executing queries, viewing execution plans, and browsing the object explorer. For a syntax reference, see the [SQLite language docs](https://www.sqlite.org/lang.html).

## Is it good for SQL interview preparation?

Yes. The 74 practice questions mirror common technical-interview patterns: multi-table JOINs, GROUP BY with HAVING, correlated subqueries, EXISTS versus IN, CTEs, and window functions. Each question shows the expected result set, and the comparison view highlights exact cell-level mismatches, so you self-verify without a reference answer.

The key takeaway: you can rehearse the query shapes interviewers actually ask, then use MS SQL mode to practice translating each one to T-SQL — the dialect used across most enterprise SQL Server environments.

## About SQL Query Lab

SQL Query Lab was built as a practical learning tool for developers and database professionals who need to practice SQL without fighting environment setup. It was first deployed in 2024 and is actively maintained, with regular updates to the question bank and feature set.

The frontend runs as a static site on Vercel with zero runtime server — sql.js executes SQL in the browser via WebAssembly. The backend, used only for live SQL Server connections, runs as a containerized Node.js service. Connection credentials are encrypted with AES-256-GCM behind a server-side master password before storage.
