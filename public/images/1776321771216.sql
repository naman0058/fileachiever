-- Hackathon Management Platform - MySQL Schema
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS certificate_issuance;
DROP TABLE IF EXISTS certificate_templates;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS issues;
DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS eval_criteria;
DROP TABLE IF EXISTS evaluator_assignments;
DROP TABLE IF EXISTS evaluation_rounds;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS lab_assignments;
DROP TABLE IF EXISTS labs;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS problems;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS gallery_images;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  mobile VARCHAR(32) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','participant','evaluator','coordinator') NOT NULL DEFAULT 'participant',
  college VARCHAR(200) DEFAULT NULL,
  department VARCHAR(120) DEFAULT NULL,
  year VARCHAR(20) DEFAULT NULL,
  photo_path VARCHAR(255) DEFAULT NULL,
  security_question VARCHAR(255) DEFAULT NULL,
  security_answer_hash VARCHAR(255) DEFAULT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  venue VARCHAR(200) DEFAULT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reg_last_date DATE NOT NULL,
  participation_fee DECIMAL(10,2) DEFAULT 0,
  max_team_size INT UNSIGNED DEFAULT 4,
  status ENUM('upcoming','live','completed') NOT NULL DEFAULT 'upcoming',
  active TINYINT(1) NOT NULL DEFAULT 1,
  rules_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE problems (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT NULL,
  difficulty ENUM('easy','medium','hard') DEFAULT 'medium',
  max_capacity INT UNSIGNED DEFAULT 10,
  status ENUM('draft','active','closed') NOT NULL DEFAULT 'active',
  active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE teams (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  team_code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  leader_id INT UNSIGNED NOT NULL,
  problem_id INT UNSIGNED DEFAULT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_team_event_name (event_id, name),
  UNIQUE KEY uq_team_code (team_code),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (leader_id) REFERENCES users(id),
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE team_members (
  team_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role_in_team ENUM('leader','member') NOT NULL DEFAULT 'member',
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE registrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED DEFAULT NULL,
  status ENUM('pending','verified','rejected','paid','unpaid') NOT NULL DEFAULT 'pending',
  payment_note VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_event (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE labs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  lab_number VARCHAR(32) DEFAULT NULL,
  capacity INT UNSIGNED DEFAULT 30,
  location VARCHAR(200) DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE lab_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  lab_id INT UNSIGNED NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE attendance (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED DEFAULT NULL,
  lab_id INT UNSIGNED DEFAULT NULL,
  check_code VARCHAR(64) DEFAULT NULL,
  check_in_time DATETIME NOT NULL,
  attendance_date DATE NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE submissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  abstract_text TEXT,
  file_path VARCHAR(255) DEFAULT NULL,
  repo_link VARCHAR(500) DEFAULT NULL,
  demo_link VARCHAR(500) DEFAULT NULL,
  status ENUM('draft','submitted','under_evaluation','evaluated','locked') NOT NULL DEFAULT 'submitted',
  submitted_at DATETIME DEFAULT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE evaluation_rounds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  round_order INT UNSIGNED DEFAULT 1,
  locked TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE eval_criteria (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  round_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  max_marks DECIMAL(8,2) NOT NULL DEFAULT 10,
  FOREIGN KEY (round_id) REFERENCES evaluation_rounds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE evaluator_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluator_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  round_id INT UNSIGNED NOT NULL,
  FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES evaluation_rounds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE scores (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluator_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED NOT NULL,
  round_id INT UNSIGNED NOT NULL,
  criterion_id INT UNSIGNED NOT NULL,
  marks DECIMAL(8,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eval_team_crit (evaluator_id, team_id, criterion_id),
  FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES evaluation_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (criterion_id) REFERENCES eval_criteria(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE issues (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED DEFAULT NULL,
  event_id INT UNSIGNED DEFAULT NULL,
  category ENUM('technical','registration','submission','team','other') NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  status ENUM('open','processing','resolved') NOT NULL DEFAULT 'open',
  admin_remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feedback (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  rating_org TINYINT UNSIGNED DEFAULT 5,
  rating_problem TINYINT UNSIGNED DEFAULT 5,
  rating_eval TINYINT UNSIGNED DEFAULT 5,
  rating_overall TINYINT UNSIGNED DEFAULT 5,
  comments TEXT,
  category ENUM('suggestion','complaint','appreciation') DEFAULT 'suggestion',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_feedback_user_event (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE certificate_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  body_html TEXT,
  signatory_name VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE certificate_issuance (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED DEFAULT NULL,
  user_id INT UNSIGNED NOT NULL,
  team_id INT UNSIGNED DEFAULT NULL,
  event_id INT UNSIGNED NOT NULL,
  cert_type ENUM('participation','winner','runner_up','special_mention') NOT NULL DEFAULT 'participation',
  issued_at DATE NOT NULL,
  meta_json TEXT,
  FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE gallery_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED DEFAULT NULL,
  caption VARCHAR(255) DEFAULT NULL,
  image_path VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activity_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED DEFAULT NULL,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(80) DEFAULT NULL,
  entity_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO system_settings (setting_key, setting_value) VALUES
('registration_open','1'),
('team_creation_open','1'),
('problem_selection_open','1'),
('submission_portal_open','1'),
('feedback_open','1'),
('homepage_announcement','Welcome to the Hackathon Management Platform — register your team and build the future.'),
('leaderboard_visible','1'),
('submission_deadline',''),
('certificate_available','1');
