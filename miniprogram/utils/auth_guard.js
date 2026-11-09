const authState = require('./auth_state')
const data = require('./data')

function requireLogin() {
  const session = authState.getSession()
  if (!session) {
    wx.reLaunch({ url: '/pages/auth/auth' })
    return false
  }
  data.setUserScope(session.user.id, { migrateLegacy: !session.preview && !session.guest, guest: !!session.guest })
  data.ensureDefaults()
  return true
}

module.exports = requireLogin
