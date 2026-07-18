export type Lang = 'fr' | 'en'

export let lang: Lang = 'fr'
export function setLang(l: Lang) { lang = l }

const S = {
  fr: {
    appTitle: 'Daily Draw',
    tagline: 'Connecte-toi pour accéder à tes dessins',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    login: 'Se connecter',
    logout: 'Déconnexion',
    navToday: "Aujourd'hui",
    navHistory: 'Historique',
    navSettings: 'Paramètres',
    needInspiration: '✦ Besoin d\'inspiration ?',
    inspirationTitle: '✦ Idées de dessins',
    newIdeas: 'Nouvelles idées',
    close: 'Fermer',
    clickOrDrop: 'Cliquer ou déposer\npour uploader',
    replace: 'Remplacer',
    uploading: 'Envoi en cours…',
    waitingPrefix: 'En attente de',
    waitingSuffix: '…',
    historyTitle: 'Historique',
    historySubtitle: 'Vos dessins des jours précédents',
    noHistory: "Aucun dessin dans l'historique pour l'instant.",
    noHistoryHint: 'Commencez à uploader vos créations !',
    errorLoading: 'Erreur lors du chargement.',
    you: 'vous',
    streakLabel: 'Série',
    streakDaySingular: 'jour',
    streakDayPlural: 'jours',
    streakNone: '–',
    settingsTitle: 'Paramètres',
    changePassword: 'Changer le mot de passe',
    currentPassword: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer',
    savePassword: 'Mettre à jour',
    passwordMismatch: 'Les mots de passe ne correspondent pas.',
    passwordTooShort: 'Au moins 6 caractères.',
    passwordChanged: 'Mot de passe modifié ✓',
    incorrectPassword: 'Mot de passe actuel incorrect.',
    languageLabel: 'Langue',
    loginError: 'Identifiants incorrects.',
    welcomePrefix: 'Bienvenue',
    needInspirationPrefix: "Besoin d'inspiration ? Visitez",
    themeSettingsTitle: 'Thèmes des prochains jours',
    themePlaceholder: 'Thème du jour (optionnel)',
    themeSaved: 'Thèmes enregistrés ✓',
    saveThemes: 'Enregistrer',
    teamLabel: 'Équipe',
    teamMembers: 'Membres',
    teamFull: 'Équipe complète (4 membres max)',
    teamCreate: 'Créer une équipe',
    teamNameLabel: "Nom de l'équipe",
    teamCreated: 'Équipe créée ✓',
    teamNameRequired: 'Nom requis.',
    inviteSectionTitle: 'Inviter un membre',
    inviteEmail: 'Adresse email',
    inviteSend: "Envoyer l'invitation",
    inviteSent: 'Invitation envoyée ✓',
    inviteCopyLink: 'Copier le lien',
    inviteLinkCopied: 'Lien copié ✓',
    inviteAcceptHeading: "Rejoindre l'équipe",
    inviteJoin: "Rejoindre",
    inviteInvalid: 'Ce lien est invalide ou a expiré.',
    roleOwner: 'propriétaire',
    roleMember: 'membre',
  },
  en: {
    appTitle: 'Daily Draw',
    tagline: 'Log in to access your drawings',
    username: 'Username',
    password: 'Password',
    login: 'Log in',
    logout: 'Log out',
    navToday: 'Today',
    navHistory: 'History',
    navSettings: 'Settings',
    needInspiration: '✦ Need inspiration?',
    inspirationTitle: '✦ Drawing ideas',
    newIdeas: 'New ideas',
    close: 'Close',
    clickOrDrop: 'Click or drop\nto upload',
    replace: 'Replace',
    uploading: 'Uploading…',
    waitingPrefix: 'Waiting for',
    waitingSuffix: '…',
    historyTitle: 'History',
    historySubtitle: 'Your drawings from previous days',
    noHistory: 'No drawings in history yet.',
    noHistoryHint: 'Start uploading your creations!',
    errorLoading: 'Error loading.',
    you: 'you',
    streakLabel: 'Streak',
    streakDaySingular: 'day',
    streakDayPlural: 'days',
    streakNone: '–',
    settingsTitle: 'Settings',
    changePassword: 'Change password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmPassword: 'Confirm',
    savePassword: 'Update',
    passwordMismatch: 'Passwords do not match.',
    passwordTooShort: 'At least 6 characters.',
    passwordChanged: 'Password updated ✓',
    incorrectPassword: 'Current password is incorrect.',
    languageLabel: 'Language',
    loginError: 'Invalid credentials.',
    welcomePrefix: 'Welcome',
    needInspirationPrefix: 'Need inspiration? Visit',
    themeSettingsTitle: 'Themes for upcoming days',
    themePlaceholder: 'Daily theme (optional)',
    themeSaved: 'Themes saved ✓',
    saveThemes: 'Save themes',
    teamLabel: 'Team',
    teamMembers: 'Members',
    teamFull: 'Team is full (max 4 members)',
    teamCreate: 'Create a team',
    teamNameLabel: 'Team name',
    teamCreated: 'Team created ✓',
    teamNameRequired: 'Name required.',
    inviteSectionTitle: 'Invite a member',
    inviteEmail: 'Email address',
    inviteSend: 'Send invite',
    inviteSent: 'Invite sent ✓',
    inviteCopyLink: 'Copy link',
    inviteLinkCopied: 'Link copied ✓',
    inviteAcceptHeading: 'Join team',
    inviteJoin: 'Join',
    inviteInvalid: 'This invite link is invalid or has expired.',
    roleOwner: 'owner',
    roleMember: 'member',
  },
} as const

export type TKey = keyof typeof S.fr

export function t(key: TKey): string {
  return (S[lang] as Record<string, string>)[key] ?? (S.fr as Record<string, string>)[key]
}

// Dynamic helpers
export function streakText(n: number): string {
  if (n === 0) return t('streakNone')
  const word = n === 1 ? t('streakDaySingular') : t('streakDayPlural')
  return `🔥 ${n} ${word}`
}

export function waitingFor(name: string): string {
  return `${t('waitingPrefix')} ${name}${t('waitingSuffix')}`
}

// French date formatting (always French for dates regardless of lang)
const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatDate(iso: string): { day: string; num: string; monthYear: string } {
  const d = new Date(iso + 'T12:00:00')
  const days = lang === 'en' ? DAYS_EN : DAYS_FR
  const months = lang === 'en' ? MONTHS_EN : MONTHS_FR
  return { day: days[d.getDay()], num: String(d.getDate()), monthYear: `${months[d.getMonth()]} ${d.getFullYear()}` }
}

export function formatShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const days = lang === 'en' ? DAYS_EN : DAYS_FR
  const months = lang === 'en' ? MONTHS_EN : MONTHS_FR
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}
