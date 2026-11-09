const SESSION_KEY = 'cloudNest.auth.session.v1'
const GUEST_USER_ID = '__cloud_nest_guest_local__'
const GUEST_DEVICE_KEY = 'cloudNest.guest.deviceKey.v1'

function isDevTools() {
  try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false }
}

function getSession() {
  try {
    const session = wx.getStorageSync(SESSION_KEY)
    if (session && session.preview && !isDevTools()) {
      clearSession()
      return null
    }
    if (!session || !session.token || !session.user || !session.user.id || Number(session.expiresAt) <= Date.now()) {
      if (session) clearSession()
      return null
    }
    return session
  } catch (error) {
    return null
  }
}

function setSession(session) {
  if (!session || !session.token || !session.user || !session.user.id || !session.expiresAt) {
    throw new Error('invalid_auth_session')
  }
  wx.setStorageSync(SESSION_KEY, session)
  require('./data').setUserScope(session.user.id, { migrateLegacy: !session.preview && !session.guest, guest: !!session.guest })
  return session
}

async function guestDeviceKey() {
  try {
    let key = wx.getStorageSync(GUEST_DEVICE_KEY)
    if (!/^[0-9a-f]{64}$/.test(key || '')) {
      let randomValues = null
      if (typeof wx.getRandomValues === 'function') {
        randomValues = await new Promise(resolve => {
          let settled = false
          const finish = value => { if (settled) return; settled = true; resolve(value) }
          wx.getRandomValues({ length: 32, success: result => finish(result && result.randomValues), fail: () => finish(null) })
          setTimeout(() => finish(null), 1000)
        })
      }
      const source = randomValues instanceof ArrayBuffer ? new Uint8Array(randomValues) : randomValues
      const bytes = source ? Array.from(source).slice(0, 32) : []
      while (bytes.length < 32) bytes.push(Math.floor(Math.random() * 256))
      key = bytes.map(value => Number(value).toString(16).padStart(2, '0')).join('')
      wx.setStorageSync(GUEST_DEVICE_KEY, key)
    }
    return key
  } catch (error) {
    return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }
}

async function startGuestSession() {
  let previous = null
  try { previous = wx.getStorageSync(SESSION_KEY) || null } catch (error) {}
  if (previous && previous.guest && previous.remoteGuest && Number(previous.expiresAt) > Date.now()) return getSession()
  const response = await require('./api').request('/api/auth/guest', 'POST', { deviceKey: await guestDeviceKey() }, { timeout: 20000 })
  const session = { ...response, guest: true, remoteGuest: true }
  if (session.user && session.user.id) require('./data').migrateUserScope(GUEST_USER_ID, session.user.id)
  if (previous && previous.guest && previous.user && session.user && previous.user.id !== session.user.id) {
    require('./data').migrateUserScope(previous.user.id, session.user.id)
  }
  return setSession(session)
}

function startPreviewSession() {
  if (!isDevTools()) throw new Error('preview_mode_only_in_devtools')
  return setSession({
    token: 'local-preview-session',
    user: { id: '__cloud_nest_dev_preview__', displayName: '本地演示', contact: '仅开发者工具可用' },
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    preview: true
  })
}

function clearSession() {
  try { wx.removeStorageSync(SESSION_KEY) } catch (error) {}
  try { require('./data').setUserScope('') } catch (error) {}
}

function isAuthenticated() {
  return !!getSession()
}

function isPreview() {
  const session = getSession()
  return !!(session && session.preview)
}

module.exports = { SESSION_KEY, GUEST_USER_ID, getSession, setSession, startGuestSession, startPreviewSession, clearSession, isAuthenticated, isDevTools, isPreview, isGuest: () => { const session = getSession(); return !!(session && session.guest) } }
