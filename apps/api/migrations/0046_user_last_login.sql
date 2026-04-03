-- Track last login timestamp for admin dashboard
ALTER TABLE users ADD COLUMN last_login_at TEXT;
