const authState = require('../../utils/auth_state')
Page({ enter() { const session = authState.getSession(); const needsGuestUpgrade = session && session.guest && !session.remoteGuest; wx.redirectTo({ url: session && !needsGuestUpgrade ? '/pages/home/home' : '/pages/auth/auth' }) } })
