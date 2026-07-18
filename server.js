require('dotenv').config()

const express = require('express')
const session = require('express-session')
const multer = require('multer')
const path = require('path')
const db = require('./db')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const app = express()
const PORT = process.env.PORT || 3006

// Seed initial users from env vars on first run
db.seedUser(process.env.USER1_NAME, process.env.USER1_PASS)
db.seedUser(process.env.USER2_NAME, process.env.USER2_PASS)

let s3 = null
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) {
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

async function getImageUrl(key) {
  if (process.env.R2_PUBLIC_URL) return `${process.env.R2_PUBLIC_URL}/${key}`
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }), { expiresIn: 3600 })
}

app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET || 'daily-draw-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'))
    cb(null, true)
  },
})

function requireAuth(req, res, next) {
  if (req.session.userId) return next()
  res.status(401).json({ error: 'Not authenticated' })
}

function requireAdmin(req, res, next) {
  const adminPass = process.env.ADMIN_PASSWORD
  if (!adminPass || req.headers['x-admin-password'] !== adminPass) return res.status(403).json({ error: 'Forbidden' })
  next()
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  const user = db.getUserByUsername(username)
  if (!user || !db.verifyPassword(password, user.password_hash, user.password_salt)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  req.session.userId = user.id
  req.session.username = user.username
  res.json({ username: user.username, language: user.language })
})

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy()
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' })
  const user = db.getUserById(req.session.userId)
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  res.json({ username: user.username, language: user.language })
})

// ── Account settings ──────────────────────────────────────────────────────────
app.put('/api/account/language', requireAuth, (req, res) => {
  const { language } = req.body
  if (!['fr', 'en'].includes(language)) return res.status(400).json({ error: 'Invalid language' })
  db.updateLanguage(req.session.userId, language)
  res.json({ ok: true })
})

app.put('/api/account/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' })
  const user = db.getUserById(req.session.userId)
  if (!db.verifyPassword(currentPassword, user.password_hash, user.password_salt)) {
    return res.status(401).json({ error: 'Current password incorrect' })
  }
  db.updatePassword(req.session.userId, newPassword)
  res.json({ ok: true })
})

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', requireAuth, (_req, res) => {
  res.json({ users: db.getAllUsers().map(u => u.username) })
})

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'username and password required' })
  try {
    db.addUser(username, password)
    res.json({ ok: true, username })
  } catch (e) {
    res.status(409).json({ error: 'Username already exists' })
  }
})

// ── Streaks ───────────────────────────────────────────────────────────────────
app.get('/api/streaks', requireAuth, (_req, res) => {
  res.json({ streaks: db.getAllStreaks() })
})

// ── Upload ────────────────────────────────────────────────────────────────────
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!s3) return res.status(503).json({ error: 'R2 not configured' })
  if (!req.file) return res.status(400).json({ error: 'No file' })

  const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg'
  const date = todayISO()
  const key = `uploads/${date}/${req.session.username}.${ext}`

  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }))

  db.recordSubmission(req.session.userId, date, key)
  res.json({ ok: true })
})

// ── Uploads for a date ────────────────────────────────────────────────────────
app.get('/api/uploads/:date', requireAuth, async (req, res) => {
  const rows = db.getSubmissionsForDate(req.params.date)
  const uploads = {}
  for (const row of rows) {
    uploads[row.username] = s3 ? await getImageUrl(row.r2_key) : null
  }
  const theme = db.getTheme(req.params.date)
  res.json({ date: req.params.date, uploads, theme })
})

// ── Themes ────────────────────────────────────────────────────────────────────
app.get('/api/themes/next7', requireAuth, (req, res) => {
  const today = todayISO()
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(today + 'T12:00:00')
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  res.json({ themes: db.getThemesForDates(dates) })
})

app.put('/api/themes/:date', requireAuth, (req, res) => {
  db.setTheme(req.params.date, req.body.theme || '')
  res.json({ ok: true })
})

// ── Days with submissions ─────────────────────────────────────────────────────
app.get('/api/days', requireAuth, (_req, res) => {
  const today = todayISO()
  const days = db.getAllDates().filter(d => d !== today)
  res.json({ days })
})

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))
}

app.listen(PORT, () => console.log(`Daily Draw running on port ${PORT}`))
