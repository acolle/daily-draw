import { t, setLang, lang, formatDate, formatShort, streakText, waitingFor, type Lang } from './i18n'

const PROMPTS_FR = [
  "Une librairie abandonnée envahie de plantes grimpantes",
  "Un marché nocturne sous une pluie fine",
  "Un café parisien un soir d'automne, vu de l'extérieur",
  "Une forêt de champignons géants bioluminescents",
  "Une station spatiale miniature posée sur un bureau",
  "Un phare solitaire au milieu d'un océan de nuages",
  "Une vieille ville sous une cloche de verre, hors du temps",
  "Un robot jardinier qui arrose des fleurs sur la Lune",
  "Une sorcière qui tient une boulangerie moderne",
  "Un détective chat en imperméable sous la pluie",
  "Un vieil explorateur qui découvre une civilisation de poche",
  "Une pêcheuse qui attrape des étoiles filantes",
  "Un scientifique entouré de bocaux contenant des émotions",
  "Une pieuvre architecte construisant une cité sous-marine",
  "Un renard bibliothécaire entouré de livres anciens",
  "Une montre à gousset qui fond dans un désert de sel",
  "Un appareil photo argentique qui photographie des fantômes",
  "Un parapluie qui s'envole vers une île flottante",
  "Une fenêtre qui donne sur un autre siècle",
  "Des chaussures qui partent en voyage seules",
  "Dessine ce à quoi ressemble le silence",
  "Représente une odeur que tu aimes",
  "Capture la sensation d'un souvenir flou",
  "Ta chambre si elle était au fond de la mer",
  "Un portail caché derrière une étagère, ouvert sur une prairie",
  "Un pianiste qui joue sous l'eau pour des poissons",
  "Une maison de poupée habitée par des insectes élégants",
  "Un éléphant qui peint des galaxies sur une toile immense",
  "Un pingouin astronaute explorant une planète inconnue",
  "Illustre le concept de curiosité sans point d'interrogation",
]

const PROMPTS_EN = [
  "An abandoned bookshop overtaken by climbing plants",
  "A night market under a fine rain",
  "A Parisian café on an autumn evening, seen from outside",
  "A forest of giant bioluminescent mushrooms",
  "A miniature space station sitting on a desk",
  "A solitary lighthouse in the middle of an ocean of clouds",
  "An old town preserved under a glass dome, outside of time",
  "A robot gardener watering flowers on the Moon",
  "A witch who runs a modern bakery",
  "A cat detective in a trench coat in the rain",
  "An old explorer discovering a pocket-sized civilization",
  "A fisherwoman catching shooting stars on her line",
  "A scientist surrounded by jars containing emotions",
  "An octopus architect building an underwater city",
  "A fox librarian surrounded by ancient books",
  "A pocket watch melting in a salt desert",
  "A film camera photographing ghosts",
  "An umbrella flying towards a floating island",
  "A window that looks out onto another century",
  "A pair of shoes that decide to go on a trip alone",
  "Draw what silence looks like",
  "Represent a smell you love",
  "Capture the feeling of a blurry memory",
  "Your room if it were at the bottom of the sea",
  "A portal hidden behind a bookshelf, opening onto a meadow",
  "A pianist playing underwater for fish",
  "A dollhouse inhabited by elegant insects",
  "An elephant painting galaxies on a huge canvas",
  "A penguin astronaut exploring an unknown planet",
  "Illustrate the concept of curiosity without a question mark",
]

// ── State ─────────────────────────────────────────────────────────────────────
let me: string | null = null
let users: string[] = []
let view: 'today' | 'past' | 'settings' = 'today'
let streaks: Record<string, number> = {}
let todayUploads: Record<string, string | null> = {}
let uploading = false

const app = document.getElementById('app')!
const fileInput = document.getElementById('file-input') as HTMLInputElement

// ── API helpers ───────────────────────────────────────────────────────────────
async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const isFormData = opts?.body instanceof FormData
  const res = await fetch(url, {
    headers: isFormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error((e as Record<string, string>).error || res.statusText)
  }
  return res.json()
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function getPrompts(): string[] {
  return lang === 'en' ? PROMPTS_EN : PROMPTS_FR
}

function pickRandom(n: number): string[] {
  const pool = [...getPrompts()]
  const out: string[] = []
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const data = await api<{ username: string; language: string }>('/api/auth/me')
    me = data.username
    setLang((data.language as Lang) || 'fr')
    await loadUsers()
    renderApp()
  } catch {
    renderLogin()
  }
}

async function loadUsers() {
  const data = await api<{ users: string[] }>('/api/users')
  users = data.users
}

// ── Login ─────────────────────────────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>${t('appTitle')}</h1>
        <p>${t('tagline')}</p>
        <div class="field"><label>${t('username')}</label><input id="l-user" type="text" autocomplete="username" /></div>
        <div class="field"><label>${t('password')}</label><input id="l-pass" type="password" autocomplete="current-password" /></div>
        <button class="btn btn-primary" id="l-btn">${t('login')}</button>
        <div class="error-msg" id="l-err"></div>
      </div>
    </div>`

  const doLogin = async () => {
    const username = (document.getElementById('l-user') as HTMLInputElement).value.trim()
    const password = (document.getElementById('l-pass') as HTMLInputElement).value
    const errEl = document.getElementById('l-err')!
    try {
      const data = await api<{ username: string; language: string }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ username, password })
      })
      me = data.username
      setLang((data.language as Lang) || 'fr')
      await loadUsers()
      renderApp()
    } catch {
      errEl.textContent = t('loginError')
    }
  }
  document.getElementById('l-btn')!.addEventListener('click', doLogin)
  document.getElementById('l-pass')!.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() })
}

// ── App shell ─────────────────────────────────────────────────────────────────
function renderApp() {
  app.innerHTML = `
    <header>
      <h1><a href="/" class="app-title-link">${t('appTitle')}</a></h1>
      <nav id="main-nav">
        <button class="nav-btn ${view === 'today' ? 'active' : ''}" id="nav-today">${t('navToday')}</button>
        <button class="nav-btn ${view === 'past' ? 'active' : ''}" id="nav-past">${t('navHistory')}</button>
        <button class="nav-btn ${view === 'settings' ? 'active' : ''}" id="nav-settings">${t('navSettings')}</button>
        <button class="nav-btn nav-logout-mobile" id="logout-btn-mobile">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:0.4rem">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          ${t('logout')}
        </button>
      </nav>
      <div class="user-chip">
        <span>${t('welcomePrefix')} <strong>${me}</strong></span>
        <button class="btn-icon header-logout" id="logout-btn" title="${t('logout')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
      <button class="hamburger" id="hamburger-btn" aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
    </header>
    <main id="main-content"></main>`

  const mainNav = document.getElementById('main-nav')!
  document.getElementById('hamburger-btn')!.addEventListener('click', () => mainNav.classList.toggle('open'))

  const doLogout = async () => { await api('/api/auth/logout', { method: 'POST' }); me = null; renderLogin() }
  const navClick = (v: typeof view) => { mainNav.classList.remove('open'); view = v; renderApp() }
  document.getElementById('nav-today')!.addEventListener('click', () => navClick('today'))
  document.getElementById('nav-past')!.addEventListener('click', () => navClick('past'))
  document.getElementById('nav-settings')!.addEventListener('click', () => navClick('settings'))
  document.getElementById('logout-btn')!.addEventListener('click', doLogout)
  document.getElementById('logout-btn-mobile')!.addEventListener('click', doLogout)

  if (view === 'today') renderToday()
  else if (view === 'past') renderPast()
  else renderSettings()
}

// ── Today ─────────────────────────────────────────────────────────────────────
async function renderToday() {
  const content = document.getElementById('main-content')!
  const date = todayISO()
  const { day, num, monthYear } = formatDate(date)

  content.innerHTML = `
    <div class="today-date">
      <div class="day-name">${day}</div>
      <div class="date-num">${num}</div>
      <div class="month-year">${monthYear}</div>
    </div>
    <div class="inspiration-wrap">
      <span class="inspiration-text">${t('needInspirationPrefix')} <a href="https://peerdiem.com" target="_blank" rel="noopener noreferrer">Peerdiem</a></span>
    </div>
    <div id="today-theme"></div>
    <div class="columns" id="cols">
      ${users.map(() => `<div class="col-card"><div class="uploading-indicator"><div class="spinner"></div></div></div>`).join('')}
    </div>`

  try {
    const [uploadData, streakData] = await Promise.all([
      api<{ uploads: Record<string, string | null>; theme?: string | null }>(`/api/uploads/${date}`),
      api<{ streaks: Record<string, number> }>('/api/streaks'),
    ])
    todayUploads = uploadData.uploads
    streaks = streakData.streaks
    const themeEl = document.getElementById('today-theme')
    if (themeEl && uploadData.theme) {
      themeEl.innerHTML = `<div class="day-theme"><span class="day-theme-badge">${uploadData.theme}</span></div>`
    }
  } catch {
    todayUploads = {}
    streaks = {}
  }

  const colsEl = document.getElementById('cols')!
  colsEl.innerHTML = users.map(u => renderColHTML(u, todayUploads[u])).join('')
  users.forEach(u => attachColEvents(u))
}

function renderColHTML(username: string, imageUrl?: string | null): string {
  const isMe = username === me
  const streak = streakText(streaks[username] ?? 0)
  const youBadge = isMe ? `<span class="col-you">${t('you')}</span>` : ''
  let body: string

  if (uploading && isMe) {
    body = `<div class="uploading-indicator">${t('uploading')} <div class="spinner" style="margin-left:0.5rem"></div></div>`
  } else if (imageUrl) {
    body = `
      <div class="upload-preview">
        <div class="img-wrap" data-url="${imageUrl}">
          <img src="${imageUrl}" alt="${username}" />
          <div class="zoom-overlay"><div class="zoom-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg></div></div>
        </div>
        ${isMe ? `<button class="replace-btn">${t('replace')}</button>` : ''}
      </div>`
  } else if (isMe) {
    body = `
      <div class="placeholder own" id="ph-${username}">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
        <span>${t('clickOrDrop').replace('\n', '<br>')}</span>
      </div>`
  } else {
    body = `
      <div class="placeholder waiting">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2" stroke-linecap="round"/></svg>
        <span>${waitingFor(username)}</span>
      </div>`
  }

  return `
    <div class="col-card" id="col-${username}">
      <div class="col-header">
        <span class="col-name">${username}</span>
        <div style="display:flex;align-items:center;gap:0.5rem">${youBadge}<span class="streak-badge" title="${t('streakLabel')}">${streak}</span></div>
      </div>
      <div class="col-body">${body}</div>
    </div>`
}

function attachColEvents(username: string) {
  if (username !== me) return
  const ph = document.getElementById(`ph-${username}`)
  if (ph) {
    ph.addEventListener('click', () => fileInput.click())
    ph.addEventListener('dragover', e => { e.preventDefault(); ph.classList.add('drag-over') })
    ph.addEventListener('dragleave', () => ph.classList.remove('drag-over'))
    ph.addEventListener('drop', e => { e.preventDefault(); ph.classList.remove('drag-over'); const f = e.dataTransfer?.files[0]; if (f) handleUpload(f) })
  }
  const replaceBtn = document.querySelector<HTMLElement>(`#col-${username} .replace-btn`)
  replaceBtn?.addEventListener('click', () => fileInput.click())
}

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) handleUpload(fileInput.files[0])
  fileInput.value = ''
})

async function handleUpload(file: File) {
  if (!file.type.startsWith('image/')) return
  uploading = true

  const col = document.getElementById(`col-${me}`)
  if (col) col.querySelector('.col-body')!.innerHTML =
    `<div class="uploading-indicator">${t('uploading')} <div class="spinner" style="margin-left:0.5rem"></div></div>`

  try {
    const fd = new FormData()
    fd.append('image', file)
    await fetch('/api/upload', { method: 'POST', body: fd })
    uploading = false
    const [uploadData, streakData] = await Promise.all([
      api<{ uploads: Record<string, string | null> }>(`/api/uploads/${todayISO()}`),
      api<{ streaks: Record<string, number> }>('/api/streaks'),
    ])
    todayUploads = uploadData.uploads
    streaks = streakData.streaks
    if (col) {
      col.outerHTML = renderColHTML(me!, todayUploads[me!])
      attachColEvents(me!)
    }
  } catch {
    uploading = false
    renderToday()
  }
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(url: string) {
  document.getElementById('lightbox-overlay')?.remove()
  const el = document.createElement('div')
  el.id = 'lightbox-overlay'
  el.className = 'lightbox-overlay'
  el.innerHTML = `<img src="${url}" />`
  document.body.appendChild(el)
  el.addEventListener('click', () => el.remove())
}

document.addEventListener('click', e => {
  const wrap = (e.target as Element).closest<HTMLElement>('.img-wrap')
  if (wrap?.dataset.url) openLightbox(wrap.dataset.url)
})

// ── Inspiration ───────────────────────────────────────────────────────────────
function showInspiration() {
  let prompts = pickRandom(3)
  const render = () => {
    document.getElementById('modal-overlay')?.remove()
    const el = document.createElement('div')
    el.id = 'modal-overlay'
    el.className = 'modal-overlay'
    el.innerHTML = `
      <div class="modal">
        <h2>${t('inspirationTitle')}</h2>
        <div class="prompts-list">${prompts.map(p => `<div class="prompt-item">${p}</div>`).join('')}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="new-prompts">${t('newIdeas')}</button>
          <button class="btn btn-primary" id="close-modal" style="width:auto">${t('close')}</button>
        </div>
      </div>`
    document.body.appendChild(el)
    document.getElementById('close-modal')!.addEventListener('click', () => el.remove())
    el.addEventListener('click', e => { if (e.target === el) el.remove() })
    document.getElementById('new-prompts')!.addEventListener('click', () => { prompts = pickRandom(3); render() })
  }
  render()
}

// ── Past ──────────────────────────────────────────────────────────────────────
async function renderPast() {
  const content = document.getElementById('main-content')!
  content.innerHTML = `
    <div class="past-header">
      <h2>${t('historyTitle')}</h2>
      <p>${t('historySubtitle')}</p>
    </div>
    <div id="past-list"><div style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></div></div>`

  try {
    const { days } = await api<{ days: string[] }>('/api/days')
    const list = document.getElementById('past-list')!

    if (!days.length) {
      list.innerHTML = `<div class="empty-past"><p>${t('noHistory')}</p><p style="margin-top:0.5rem">${t('noHistoryHint')}</p></div>`
      return
    }

    const dayData = await Promise.all(days.map(d => api<{ date: string; uploads: Record<string, string | null> }>(`/api/uploads/${d}`)))

    list.innerHTML = dayData.map(({ date, uploads, theme }: { date: string; uploads: Record<string, string | null>; theme?: string | null }) => `
      <div class="day-row">
        <div class="day-row-label">${formatShort(date)}</div>
        ${theme ? `<div class="day-theme day-theme-mini"><span class="day-theme-badge">${theme}</span></div>` : ''}
        <div class="day-row-cols">
          ${users.map(u => `
            <div class="past-col">
              <div class="past-col-name">${u}${u === me ? ` <span style="opacity:0.5">(${t('you')})</span>` : ''}</div>
              ${uploads[u] ? `
                <div class="img-wrap" data-url="${uploads[u]}">
                  <img src="${uploads[u]}" alt="${u}" />
                  <div class="zoom-overlay"><div class="zoom-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg></div></div>
                </div>` : `<div class="empty">·</div>`}
            </div>`).join('')}
        </div>
      </div>`).join('')
  } catch {
    document.getElementById('past-list')!.innerHTML = `<div class="empty-past">${t('errorLoading')}</div>`
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function renderSettings() {
  const content = document.getElementById('main-content')!
  const today = todayISO()

  let themesData: Record<string, string | null> = {}
  try {
    const res = await api<{ themes: Record<string, string | null> }>('/api/themes/next7')
    themesData = res.themes
  } catch { /* ignore */ }

  const dates = Object.keys(themesData)

  const themeRows = dates.map((date, i) => {
    const { day, num, monthYear } = formatDate(date)
    const label = i === 0 ? `<span class="theme-date-label today-label">${day} ${num} ${monthYear}</span>`
      : `<span class="theme-date-label">${day} ${num} ${monthYear}</span>`
    return `<div class="theme-row" data-date="${date}">
      ${label}
      <input class="theme-input" type="text" placeholder="${t('themePlaceholder')}" value="${(themesData[date] ?? '').replace(/"/g, '&quot;')}" data-date="${date}" />
      <span class="theme-save-msg" style="font-family:sans-serif;font-size:0.72rem;color:var(--accent);min-width:80px"></span>
    </div>`
  }).join('')

  content.innerHTML = `
    <div class="settings-wrap">
      <h2 class="settings-title">${t('settingsTitle')}</h2>

      <div class="settings-section">
        <div class="settings-section-title">${t('themeSettingsTitle')}</div>
        ${themeRows}
      </div>

      <div class="settings-section">
        <div class="settings-section-title">${t('languageLabel')}</div>
        <div class="lang-toggle">
          <button class="lang-btn ${lang === 'fr' ? 'active' : ''}" data-lang="fr">Français</button>
          <button class="lang-btn ${lang === 'en' ? 'active' : ''}" data-lang="en">English</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">${t('changePassword')}</div>
        <div class="field"><label>${t('currentPassword')}</label><input id="s-old" type="password" /></div>
        <div class="field"><label>${t('newPassword')}</label><input id="s-new" type="password" /></div>
        <div class="field"><label>${t('confirmPassword')}</label><input id="s-conf" type="password" /></div>
        <button class="btn btn-primary" id="s-save" style="max-width:200px">${t('savePassword')}</button>
        <div class="settings-msg" id="s-msg"></div>
      </div>
    </div>`

  document.querySelectorAll<HTMLInputElement>('.theme-input').forEach(input => {
    let saveTimer: ReturnType<typeof setTimeout>
    input.addEventListener('input', () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(async () => {
        const date = input.dataset.date!
        const msgEl = input.parentElement?.querySelector('.theme-save-msg') as HTMLElement | null
        try {
          await api(`/api/themes/${date}`, { method: 'PUT', body: JSON.stringify({ theme: input.value }) })
          if (msgEl) { msgEl.textContent = t('themeSaved'); setTimeout(() => { msgEl.textContent = '' }, 2000) }
        } catch { /* ignore */ }
      }, 600)
    })
  })

  document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newLang = btn.dataset.lang as Lang
      await api('/api/account/language', { method: 'PUT', body: JSON.stringify({ language: newLang }) })
      setLang(newLang)
      renderApp()
    })
  })

  document.getElementById('s-save')!.addEventListener('click', async () => {
    const old = (document.getElementById('s-old') as HTMLInputElement).value
    const next = (document.getElementById('s-new') as HTMLInputElement).value
    const conf = (document.getElementById('s-conf') as HTMLInputElement).value
    const msg = document.getElementById('s-msg')!

    if (next !== conf) { msg.textContent = t('passwordMismatch'); msg.className = 'settings-msg error'; return }
    if (next.length < 6) { msg.textContent = t('passwordTooShort'); msg.className = 'settings-msg error'; return }

    try {
      await api('/api/account/password', { method: 'PUT', body: JSON.stringify({ currentPassword: old, newPassword: next }) })
      msg.textContent = t('passwordChanged')
      msg.className = 'settings-msg success';
      (document.getElementById('s-old') as HTMLInputElement).value = '';
      (document.getElementById('s-new') as HTMLInputElement).value = '';
      (document.getElementById('s-conf') as HTMLInputElement).value = ''
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : ''
      msg.textContent = err.includes('incorrect') ? t('incorrectPassword') : err
      msg.className = 'settings-msg error'
    }
  })
}

init()
