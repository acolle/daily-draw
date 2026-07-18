'use strict'

const { DatabaseSync } = require('node:sqlite')
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto')
const path = require('path')

const db = new DatabaseSync(path.join(__dirname, 'data.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS team_members (
    team_id INTEGER NOT NULL REFERENCES teams(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (team_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    email TEXT NOT NULL,
    invited_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'fr',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS themes (
    date TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  );
`)

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

function verifyPassword(password, storedHash, salt) {
  try {
    const buf = scryptSync(password, salt, 64)
    return timingSafeEqual(buf, Buffer.from(storedHash, 'hex'))
  } catch { return false }
}

function seedUser(username, password) {
  if (!username || !password) return
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return
  const { hash, salt } = hashPassword(password)
  db.prepare('INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?)').run(username, hash, salt)
  console.log(`[db] seeded user: ${username}`)
}

function addUser(username, password) {
  const { hash, salt } = hashPassword(password)
  db.prepare('INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?)').run(username, hash, salt)
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

function getAllUsers() {
  return db.prepare('SELECT id, username FROM users ORDER BY id').all()
}

function updateLanguage(userId, lang) {
  db.prepare('UPDATE users SET language = ? WHERE id = ?').run(lang, userId)
}

function updatePassword(userId, newPassword) {
  const { hash, salt } = hashPassword(newPassword)
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, userId)
}

function recordSubmission(userId, date, r2Key) {
  db.prepare('INSERT OR REPLACE INTO submissions (user_id, date, r2_key) VALUES (?, ?, ?)').run(userId, date, r2Key)
}

function getSubmissionsForDate(date) {
  return db.prepare(`
    SELECT u.username, s.r2_key
    FROM submissions s JOIN users u ON u.id = s.user_id
    WHERE s.date = ?
  `).all(date)
}

function getAllDates() {
  return db.prepare('SELECT DISTINCT date FROM submissions ORDER BY date DESC').all().map(r => r.date)
}

function getStreak(userId) {
  const dates = db.prepare('SELECT date FROM submissions WHERE user_id = ? ORDER BY date DESC').all(userId).map(r => r.date)
  if (!dates.length) return 0

  const today = new Date().toISOString().split('T')[0]
  const yesterday = (() => { const d = new Date(today); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()

  let current = dates.includes(today) ? today : dates.includes(yesterday) ? yesterday : null
  if (!current) return 0

  let streak = 0
  for (const date of dates) {
    if (date === current) {
      streak++
      const d = new Date(current)
      d.setDate(d.getDate() - 1)
      current = d.toISOString().split('T')[0]
    } else if (date < current) break
  }
  return streak
}

function getAllStreaks() {
  const users = getAllUsers()
  const result = {}
  for (const u of users) result[u.username] = getStreak(u.id)
  return result
}

// ── Teams ─────────────────────────────────────────────────────────────────────
function createTeam(name) {
  const result = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name)
  return result.lastInsertRowid
}

function getTeamById(id) {
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(id)
}

function getTeamsForUser(userId) {
  return db.prepare(`
    SELECT t.id, t.name, tm.role
    FROM teams t JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ? ORDER BY t.id
  `).all(userId)
}

function getTeamMembers(teamId) {
  return db.prepare(`
    SELECT u.id, u.username, tm.role
    FROM users u JOIN team_members tm ON tm.user_id = u.id
    WHERE tm.team_id = ? ORDER BY u.id
  `).all(teamId)
}

function getTeamMemberCount(teamId) {
  return db.prepare('SELECT COUNT(*) as count FROM team_members WHERE team_id = ?').get(teamId).count
}

function addUserToTeam(teamId, userId, role = 'member') {
  db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, userId, role)
}

function isUserInTeam(teamId, userId) {
  return !!db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId)
}

function getTeamUsers(teamId) {
  return db.prepare(`
    SELECT u.id, u.username FROM users u
    JOIN team_members tm ON tm.user_id = u.id
    WHERE tm.team_id = ? ORDER BY u.id
  `).all(teamId)
}

function getTeamStreaks(teamId) {
  const members = getTeamUsers(teamId)
  const result = {}
  for (const u of members) result[u.username] = getStreak(u.id)
  return result
}

function getTeamSubmissionsForDate(teamId, date) {
  return db.prepare(`
    SELECT u.username, s.r2_key FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
    WHERE s.date = ?
  `).all(teamId, date)
}

function getTeamDates(teamId) {
  return db.prepare(`
    SELECT DISTINCT s.date FROM submissions s
    JOIN team_members tm ON tm.user_id = s.user_id AND tm.team_id = ?
    ORDER BY s.date DESC
  `).all(teamId).map(r => r.date)
}

function seedDefaultTeam() {
  const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get().count
  if (teamCount > 0) return
  const users = getAllUsers()
  if (!users.length) return
  const teamId = createTeam('Daily Draw')
  users.forEach((u, i) => addUserToTeam(teamId, u.id, i === 0 ? 'owner' : 'member'))
  console.log(`[db] seeded default team (id=${teamId}) with ${users.length} member(s)`)
}

// ── Invites ───────────────────────────────────────────────────────────────────
function createInvite(teamId, email, invitedBy) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO invites (token, team_id, email, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(token, teamId, email, invitedBy, expiresAt)
  return token
}

function getInviteByToken(token) {
  return db.prepare('SELECT * FROM invites WHERE token = ?').get(token)
}

function useInvite(token) {
  db.prepare("UPDATE invites SET used_at = datetime('now') WHERE token = ?").run(token)
}

// ── Themes ────────────────────────────────────────────────────────────────────
function getTheme(date) {
  const row = db.prepare('SELECT theme FROM themes WHERE date = ?').get(date)
  return row ? row.theme : null
}

function setTheme(date, theme) {
  if (!theme || !theme.trim()) {
    db.prepare('DELETE FROM themes WHERE date = ?').run(date)
  } else {
    db.prepare('INSERT OR REPLACE INTO themes (date, theme) VALUES (?, ?)').run(date, theme.trim())
  }
}

function getThemesForDates(dates) {
  const result = {}
  for (const date of dates) result[date] = getTheme(date)
  return result
}

module.exports = {
  verifyPassword, seedUser, addUser,
  getUserByUsername, getUserById, getAllUsers,
  updateLanguage, updatePassword,
  recordSubmission, getSubmissionsForDate, getAllDates,
  getStreak, getAllStreaks,
  getTheme, setTheme, getThemesForDates,
  createTeam, getTeamById, getTeamsForUser, getTeamMembers, getTeamMemberCount,
  addUserToTeam, isUserInTeam, getTeamUsers, getTeamStreaks,
  getTeamSubmissionsForDate, getTeamDates, seedDefaultTeam,
  createInvite, getInviteByToken, useInvite,
}
