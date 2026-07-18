'use strict'

const { DatabaseSync } = require('node:sqlite')
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto')
const path = require('path')

const db = new DatabaseSync(path.join(__dirname, 'data.db'))

db.exec(`
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
}
