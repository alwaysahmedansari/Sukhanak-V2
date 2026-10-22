-- Sukhanak database tables for TiDB Cloud (MySQL compatible).
-- Run once with:  npm run db:setup      (or paste into the TiDB Cloud SQL Editor)
-- Safe to run again: every table uses "IF NOT EXISTS".
-- IDs are UUID text created by the server. Dates are stored in UTC.

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  bio MEDIUMTEXT NULL,
  avatar MEDIUMTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS posts (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(1000) NOT NULL,
  markdown MEDIUMTEXT NOT NULL,
  image MEDIUMTEXT NULL,
  summary MEDIUMTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_posts_user (user_id, created_at),
  KEY idx_posts_created (created_at)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS tags (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_name (name)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS post_tags (
  post_id CHAR(36) NOT NULL,
  tag VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, tag),
  KEY idx_post_tags_tag (tag, post_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- One row per clap. The same person can clap many times, like before.
CREATE TABLE IF NOT EXISTS post_votes (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_votes_post (post_id),
  KEY idx_votes_user (user_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS post_comments (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_comments_post (post_id, created_at),
  KEY idx_comments_user (user_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS follows (
  follower_id CHAR(36) NOT NULL,
  following_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  KEY idx_follows_following (following_id, created_at)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS user_interests (
  user_id CHAR(36) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, topic)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ignored_posts (
  user_id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, post_id),
  KEY idx_ignored_post (post_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS muted_authors (
  user_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, author_id),
  KEY idx_muted_author (author_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS user_lists (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_list_per_user (user_id, name)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS list_posts (
  list_id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  image MEDIUMTEXT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (list_id, post_id),
  KEY idx_list_posts_post (post_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  username VARCHAR(255) NOT NULL,
  avatar MEDIUMTEXT NULL,
  message VARCHAR(255) NOT NULL,
  post_id CHAR(36) NULL,
  post_title VARCHAR(1000) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, created_at)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- Login (refresh) tokens. Only a SHA-256 fingerprint is stored, never the token itself.
CREATE TABLE IF NOT EXISTS tokens (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tokens_hash (token_hash),
  KEY idx_tokens_user (user_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;
