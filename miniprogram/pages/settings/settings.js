const data = require('../../utils/data')
const requireLogin = require('../../utils/auth_guard')
Page({
  data: { settings: {} },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/me/me' }) }) },
  onShow() { if (!requireLogin()) return; this.setData({ settings: data.getSettings() }) },
  toggle(e) { const key = e.currentTarget.dataset.key; const value = e.detail.value; if (key === 'pushEnabled' && value && getApp().globalData.subscribeTemplateId && wx.requestSubscribeMessage) { const templateId = getApp().globalData.subscribeTemplateId; wx.requestSubscribeMessage({ tmplIds: [templateId], success: result => { const accepted = result[templateId] === 'accept'; data.saveSettings({ pushEnabled: accepted }); this.onShow() }, fail: () => { data.saveSettings({ pushEnabled: false }); this.onShow() } }); return } data.saveSettings({ [key]: value }); if (key === 'pushEnabled' && value) wx.showToast({ title: '已记录提醒偏好，订阅模板需在服务端配置', icon: 'none' }); this.onShow() },
  toggleQuiet(e) { const enabled = e.detail.value; data.saveSettings(enabled ? { quietMode: true, starMap: false, community: false } : { quietMode: false, starMap: true, community: true }); this.onShow() },
  privacy() { wx.navigateTo({ url: '/pages/auth/policy?type=privacy' }) }
})
