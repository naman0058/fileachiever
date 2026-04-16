-- Seed data: 8 demo records across core tables
-- Default login for all seeded users: email below, password: password

SET NAMES utf8mb4;

-- Bcrypt hash for plain text password: password
SET @pwd = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

INSERT INTO users (id, full_name, email, mobile, password_hash, role, college, department, year, security_question, status) VALUES
(1, 'System Admin', 'admin@hackathon.local', '9000000001', @pwd, 'admin', NULL, NULL, NULL, 'What is your city?', 'active'),
(2, 'Dr. Eva Luator', 'eva@hackathon.local', '9000000002', @pwd, 'evaluator', 'Tech Institute', 'CS', 'Faculty', 'What is your city?', 'active'),
(3, 'Coord Ian', 'coord@hackathon.local', '9000000003', @pwd, 'coordinator', 'Tech Institute', 'Ops', 'Staff', 'What is your city?', 'active'),
(4, 'Alice Participant', 'alice@student.local', '9000000004', @pwd, 'participant', 'State College', 'CSE', '3rd Year', 'What is your city?', 'active'),
(5, 'Bob Builder', 'bob@student.local', '9000000005', @pwd, 'participant', 'State College', 'IT', '2nd Year', 'What is your city?', 'active'),
(6, 'Carol Coder', 'carol@student.local', '9000000006', @pwd, 'participant', 'Polytechnic', 'ECE', '4th Year', 'What is your city?', 'active'),
(7, 'Dan Dev', 'dan@student.local', '9000000007', @pwd, 'participant', 'State College', 'CSE', '3rd Year', 'What is your city?', 'active'),
(8, 'Eve Engineer', 'eve@student.local', '9000000008', @pwd, 'participant', 'Institute of Tech', 'ME', '2nd Year', 'What is your city?', 'active');

INSERT INTO events (id, title, description, venue, start_date, end_date, reg_last_date, participation_fee, max_team_size, status, active, rules_text) VALUES
(1, 'Innovate 2026 — National Hackathon', 'Build scalable solutions for smart cities and sustainability.', 'Convention Center Hall A', '2026-05-10', '2026-05-12', '2026-05-01', 500.00, 5, 'upcoming', 1, 'Teams must submit original work. Plagiarism leads to disqualification.'),
(2, 'Code Sprint Weekend', '48-hour product sprint with mentorship.', 'Innovation Lab Block B', '2026-06-01', '2026-06-03', '2026-05-25', 0.00, 4, 'live', 1, 'Open source components must be credited.');

INSERT INTO problems (id, event_id, title, description, category, difficulty, max_capacity, status, active) VALUES
(1, 1, 'Smart Waste Routing', 'Optimize municipal waste collection using live data.', 'Sustainability', 'medium', 8, 'active', 1),
(2, 1, 'Campus Energy Dashboard', 'Real-time energy monitoring for educational campuses.', 'IoT', 'hard', 6, 'active', 1),
(3, 2, 'Rapid API Builder', 'Low-code tool to compose REST APIs from spreadsheets.', 'DevTools', 'easy', 10, 'active', 1);

INSERT INTO teams (id, event_id, team_code, name, leader_id, problem_id, status, created_at) VALUES
(1, 1, 'TEAM-INV-001', 'GreenBits', 4, 1, 'approved', NOW()),
(2, 1, 'TEAM-INV-002', 'ByteStorm', 5, 2, 'approved', NOW()),
(3, 2, 'TEAM-CS-001', 'API Ninjas', 6, 3, 'pending', NOW());

INSERT INTO team_members (team_id, user_id, role_in_team) VALUES
(1, 4, 'leader'), (1, 7, 'member'),
(2, 5, 'leader'), (2, 8, 'member'),
(3, 6, 'leader');

INSERT INTO registrations (id, user_id, event_id, team_id, status, payment_note) VALUES
(1, 4, 1, 1, 'verified', 'Paid offline'),
(2, 7, 1, 1, 'verified', 'Paid offline'),
(3, 5, 1, 2, 'paid', 'UPI ref 12345'),
(4, 8, 1, 2, 'paid', 'UPI ref 12346'),
(5, 6, 2, 3, 'pending', NULL);

INSERT INTO labs (id, name, lab_number, capacity, location, active) VALUES
(1, 'Innovation Lab', 'L-101', 40, 'Block A Floor 1', 1),
(2, 'Robotics Lab', 'L-205', 25, 'Block B Floor 2', 1);

INSERT INTO lab_assignments (id, event_id, team_id, lab_id) VALUES
(1, 1, 1, 1), (2, 1, 2, 2);

INSERT INTO attendance (id, user_id, event_id, team_id, lab_id, check_code, check_in_time, attendance_date) VALUES
(1, 4, 1, 1, 1, 'CHK-4-1', NOW(), CURDATE()),
(2, 5, 1, 2, 2, 'CHK-5-1', NOW(), CURDATE());

INSERT INTO submissions (id, team_id, event_id, title, abstract_text, status, submitted_at) VALUES
(1, 1, 1, 'EcoRoute MVP', 'Routing engine prototype with map integration.', 'under_evaluation', NOW()),
(2, 2, 1, 'EnergyLens', 'Dashboard for hall-level consumption.', 'submitted', NOW());

INSERT INTO evaluation_rounds (id, event_id, name, round_order, locked) VALUES
(1, 1, 'Round 1 — Idea', 1, 0),
(2, 1, 'Final Round', 2, 0);

INSERT INTO eval_criteria (id, round_id, name, max_marks) VALUES
(1, 1, 'Innovation', 25), (2, 1, 'Technical', 25), (3, 1, 'Presentation', 20),
(4, 2, 'Impact', 30);

INSERT INTO evaluator_assignments (id, evaluator_id, team_id, round_id) VALUES
(1, 2, 1, 1), (2, 2, 2, 1);

INSERT INTO scores (id, evaluator_id, team_id, round_id, criterion_id, marks) VALUES
(1, 2, 1, 1, 1, 22), (2, 2, 1, 1, 2, 20), (3, 2, 1, 1, 3, 18);

INSERT INTO issues (id, user_id, team_id, event_id, category, description, status, admin_remarks) VALUES
(1, 4, 1, 1, 'technical', 'VPN blocks Git push from lab network.', 'processing', 'IT reviewing firewall rules.'),
(2, 5, 2, 1, 'submission', 'Need one more hour for final zip.', 'open', NULL);

INSERT INTO feedback (id, user_id, event_id, rating_org, rating_problem, rating_eval, rating_overall, comments, category) VALUES
(1, 4, 1, 5, 4, 5, 5, 'Great organization and mentors.', 'appreciation');

INSERT INTO certificate_templates (id, name, body_html, signatory_name) VALUES
(1, 'Default Participation', '<p>This certifies participation in {{event}}.</p>', 'Director, Hackathon');

INSERT INTO certificate_issuance (id, template_id, user_id, team_id, event_id, cert_type, issued_at, meta_json) VALUES
(1, 1, 4, 1, 1, 'participation', CURDATE(), '{}');

INSERT INTO announcements (id, title, body, active, sort_order) VALUES
(1, 'Registrations open for Innovate 2026', 'Early bird fee applies until April 30.', 1, 1),
(2, 'Mentor hours: 10 AM – 6 PM', 'Visit Help Desk for slot booking.', 1, 2);

INSERT INTO gallery_images (id, event_id, caption, image_path) VALUES
(1, 1, 'Opening keynote 2025', 'uploads/gallery/placeholder1.svg'),
(2, 2, 'Sprint kickoff', 'uploads/gallery/placeholder2.svg');

INSERT INTO activity_log (user_id, action, entity, entity_id) VALUES
(1, 'seed', 'system', NULL),
(4, 'register', 'event', 1),
(4, 'team_create', 'team', 1);

-- Same bcrypt as password `password` — use security answer: password (case-insensitive)
UPDATE users SET security_answer_hash = @pwd WHERE security_answer_hash IS NULL;
