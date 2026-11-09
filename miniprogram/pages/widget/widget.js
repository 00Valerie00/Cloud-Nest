const data = require('../../utils/data')
const requireLogin = require('../../utils/auth_guard')
Page({
  data: { style: 'A', pet: {}, latest: null },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/me/me' }) }) },
  onShow() { if (!requireLogin()) return; const pet = data.getPet(data.getCurrentPetId()) || {}; this.setData({ pet, style: data.getSettings().widgetStyle || 'A', latest: pet.id ? data.getLetters(pet.id)[0] : null }) },
  chooseStyle(e) { const style = e.currentTarget.dataset.style; data.saveSettings({ widgetStyle: style }); this.setData({ style }); wx.showToast({ title: `已选择样式 ${style}`, icon: 'none' }) },
  showDesktopTip() { wx.showModal({ title: '把云间小窝放在桌面', content: '请在微信中将小程序添加到常用或桌面入口。部分安卓设备与微信版本支持小组件样式；iPhone 会以小程序快捷入口为主。', confirmText: '知道了', showCancel: false }) }
})
