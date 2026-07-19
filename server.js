require('dotenv').config()

const express = require('express')
const session = require('express-session')
const multer = require('multer')
const path = require('path')
const db = require('./db')
const { S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { Resend } = require('resend')

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@cirkq.com'
const APP_URL = process.env.APP_URL || 'https://draw.cirkq.com'

const app = express()
const PORT = process.env.PORT || 3006

// Seed initial users from env vars on first run
db.seedUser(process.env.USER1_NAME, process.env.USER1_PASS)
db.seedUser(process.env.USER2_NAME, process.env.USER2_PASS)
db.seedDefaultTeam()

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
app.get('/api/users', requireAuth, (req, res) => {
  const teamId = req.query.team ? parseInt(req.query.team) : null
  if (teamId && db.isUserInTeam(teamId, req.session.userId)) {
    return res.json({ users: db.getTeamUsers(teamId).map(u => u.username) })
  }
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
app.get('/api/streaks', requireAuth, (req, res) => {
  const teamId = req.query.team ? parseInt(req.query.team) : null
  if (teamId && db.isUserInTeam(teamId, req.session.userId)) {
    return res.json({ streaks: db.getTeamStreaks(teamId) })
  }
  res.json({ streaks: db.getAllStreaks() })
})

// ── R2 path migration (old: uploads/date/user.ext → new: uploads/team-N/date/user.ext) ──
async function migrateR2Paths() {
  if (!s3) return
  const submissions = db.getAllSubmissionsRaw()
  const toMigrate = submissions.filter(s => !s.r2_key.startsWith('uploads/team-'))
  if (!toMigrate.length) return
  console.log(`[migrate] Migrating ${toMigrate.length} R2 object(s) to team-scoped paths...`)
  for (const sub of toMigrate) {
    const teams = db.getTeamsForUser(sub.user_id)
    const teamId = teams[0]?.id
    if (!teamId) { console.warn(`[migrate] No team for user ${sub.user_id}, skipping`); continue }
    const filename = sub.r2_key.split('/').pop()
    const newKey = `uploads/team-${teamId}/${sub.date}/${filename}`
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        CopySource: `${process.env.R2_BUCKET_NAME}/${sub.r2_key}`,
        Key: newKey,
      }))
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: sub.r2_key }))
      db.updateSubmissionKey(sub.id, newKey)
      console.log(`[migrate] ${sub.r2_key} → ${newKey}`)
    } catch (e) {
      console.error(`[migrate] Failed for ${sub.r2_key}:`, e.message)
    }
  }
  console.log('[migrate] Done.')
}
migrateR2Paths()

// ── Upload ────────────────────────────────────────────────────────────────────
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!s3) return res.status(503).json({ error: 'R2 not configured' })
  if (!req.file) return res.status(400).json({ error: 'No file' })

  const teamId = req.body.teamId ? parseInt(req.body.teamId) : null
  const validTeamId = (teamId && db.isUserInTeam(teamId, req.session.userId))
    ? teamId
    : db.getTeamsForUser(req.session.userId)[0]?.id

  const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg'
  const date = todayISO()
  const key = `uploads/team-${validTeamId}/${date}/${req.session.username}.${ext}`

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
  const teamId = req.query.team ? parseInt(req.query.team) : null
  const rows = (teamId && db.isUserInTeam(teamId, req.session.userId))
    ? db.getTeamSubmissionsForDate(teamId, req.params.date)
    : db.getSubmissionsForDate(req.params.date)
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
app.get('/api/days', requireAuth, (req, res) => {
  const today = todayISO()
  const teamId = req.query.team ? parseInt(req.query.team) : null
  const allDates = (teamId && db.isUserInTeam(teamId, req.session.userId))
    ? db.getTeamDates(teamId)
    : db.getAllDates()
  res.json({ days: allDates.filter(d => d !== today) })
})

// ── Teams ─────────────────────────────────────────────────────────────────────
app.get('/api/teams', requireAuth, (req, res) => {
  res.json({ teams: db.getTeamsForUser(req.session.userId) })
})

app.post('/api/teams', requireAuth, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Team name required' })
  const teamId = db.createTeam(name.trim())
  db.addUserToTeam(teamId, req.session.userId, 'owner')
  res.json({ ok: true, teamId })
})

app.get('/api/teams/:id/members', requireAuth, (req, res) => {
  const teamId = parseInt(req.params.id)
  if (!db.isUserInTeam(teamId, req.session.userId)) return res.status(403).json({ error: 'Forbidden' })
  res.json({ members: db.getTeamMembers(teamId), count: db.getTeamMemberCount(teamId) })
})

app.post('/api/teams/:id/invite', requireAuth, async (req, res) => {
  const teamId = parseInt(req.params.id)
  if (!db.isUserInTeam(teamId, req.session.userId)) return res.status(403).json({ error: 'Forbidden' })
  const { email } = req.body
  if (!email?.includes('@')) return res.status(400).json({ error: 'Valid email required' })
  if (db.getTeamMemberCount(teamId) >= 4) return res.status(400).json({ error: 'Team is full (max 4 members)' })

  const team = db.getTeamById(teamId)
  const token = db.createInvite(teamId, email, req.session.userId)
  const inviteUrl = `${APP_URL}/invite/${token}`

  if (resend) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `You've been invited to join ${team.name} on Daily Draw`,
        html: `<p>You've been invited to join <strong>${team.name}</strong> on Daily Draw.</p>
               <p><a href="${inviteUrl}">Accept invitation →</a></p>
               <p style="color:#999;font-size:12px">This link expires in 7 days.</p>`,
      })
    } catch (e) {
      console.error('[resend]', e)
    }
  }

  res.json({ ok: true, inviteUrl })
})

// ── Invites (public) ──────────────────────────────────────────────────────────
app.get('/api/invite/:token', (req, res) => {
  const invite = db.getInviteByToken(req.params.token)
  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invalid or expired invite' })
  }
  const team = db.getTeamById(invite.team_id)
  res.json({ email: invite.email, teamName: team.name, teamId: invite.team_id })
})

app.post('/api/invite/:token/accept', (req, res) => {
  const invite = db.getInviteByToken(req.params.token)
  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invalid or expired invite' })
  }
  if (db.getTeamMemberCount(invite.team_id) >= 4) {
    return res.status(400).json({ error: 'Team is full' })
  }
  const { username, password } = req.body
  if (!username?.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Username and password (min 6 chars) required' })
  }
  let user = db.getUserByUsername(username.trim())
  if (!user) {
    try {
      db.addUser(username.trim(), password)
      user = db.getUserByUsername(username.trim())
    } catch {
      return res.status(409).json({ error: 'Username already taken' })
    }
  } else {
    if (!db.verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json({ error: 'Incorrect password for existing account' })
    }
  }
  db.addUserToTeam(invite.team_id, user.id, 'member')
  db.useInvite(req.params.token)
  req.session.userId = user.id
  req.session.username = user.username
  res.json({ ok: true, username: user.username, language: user.language })
})

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))
}

app.listen(PORT, () => console.log(`Daily Draw running on port ${PORT}`))
