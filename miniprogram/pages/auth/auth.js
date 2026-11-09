const data = require('../../utils/data')
const authState = require('../../utils/auth_state')

Page({
  data: { agreed: false, loading: false, errorText: '' },

  onLoad() {
    const session = authState.getSession()
    if (!session) return
    if (session.guest && !session.remoteGuest) {
      this.setData({ legacyGuest: true })
      return
    }
    wx.reLaunch({ url: '/pages/home/home' })
  },

  agreementChange(event) {
    this.setData({ agreed: (event.detail.value || []).includes('agree') })
  },

  openPolicy(event) {
    const type = event.currentTarget.dataset.type || 'privacy'
    wx.navigateTo({ url: `/pages/auth/policy?type=${type}` })
  },

  async continueAsGuest() {
    if (this.data.loading) return
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意相关说明', icon: 'none' })
      return
    }
    this.setData({ loading: true, errorText: '' })
    try {
      await authState.startGuestSession()
      data.ensureDefaults()
      wx.reLaunch({ url: '/pages/home/home' })
    } catch (error) {
      const message = error && error.message || '暂时没有连上小窝服务，请检查网络后重试。'
      this.setData({ errorText: message })
    } finally {
      this.setData({ loading: false })
    }
  }
})
