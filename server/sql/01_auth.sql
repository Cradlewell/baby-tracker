-- Database 1: Authentication (cradlewell_auth)
-- Users, one-time passwords and login sessions.
-- OTP codes and session tokens are stored only as keyed hashes, passwords only as bcrypt hashes.
-- All DATETIME columns are UTC.

CREATE TABLE IF NOT EXISTS users (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name           VARCHAR(120)    NOT NULL,
  phone               VARCHAR(20)     NOT NULL COMMENT 'E.164, e.g. +919876543210',
  email               VARCHAR(254)    NOT NULL COMMENT 'lower-cased',
  password_hash       VARCHAR(100)    NOT NULL COMMENT 'bcrypt',
  verification_status ENUM('pending', 'verified') NOT NULL DEFAULT 'pending',
  role                ENUM('nurse', 'client', 'admin') NOT NULL DEFAULT 'nurse' COMMENT 'nurse: opens clients by phone; client: a parent who sees only their own records; admin: the web dashboard only',
  google_sub          VARCHAR(64)     NULL     COMMENT 'Google account id, set after signing in with Google',
  approval_status     ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' COMMENT 'nurses who sign up in the app wait for the admin to approve them',
  verified_at         DATETIME        NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS otp_codes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purpose     ENUM('registration', 'client_access', 'password_reset') NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL COMMENT 'user who requested the code',
  client_id   BIGINT UNSIGNED NULL     COMMENT 'cradlewell_clients.clients.id for client_access codes',
  phone       VARCHAR(255)    NOT NULL COMMENT 'phone number or email address the code was sent to',
  code_hash   CHAR(64)        NOT NULL COMMENT 'HMAC-SHA256(OTP_SECRET, code)',
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at  DATETIME        NOT NULL,
  consumed_at DATETIME        NULL     COMMENT 'set when used or superseded: a code works only once',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_otp_lookup (user_id, purpose, phone, consumed_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  token_hash         CHAR(64)        NOT NULL COMMENT 'SHA-256 of the bearer token',
  client_id          BIGINT UNSIGNED NULL     COMMENT 'set once the client OTP is verified',
  client_verified_at DATETIME        NULL,
  expires_at         DATETIME        NOT NULL,
  revoked_at         DATETIME        NULL     COMMENT 'set on logout',
  last_used_at       DATETIME        NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- App errors sent by the app (crash reporting). No user, no baby data: only what failed, where,
-- and the app version, so problems can be found and fixed. Kept 90 days.
CREATE TABLE IF NOT EXISTS crash_reports (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message     VARCHAR(500)    NOT NULL,
  stack       TEXT            NULL,
  is_fatal    TINYINT(1)      NOT NULL DEFAULT 0,
  app_version VARCHAR(20)     NULL,
  platform    VARCHAR(40)     NULL,
  screen      VARCHAR(60)     NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crash_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
