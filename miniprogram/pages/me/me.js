const data = require('../../utils/data')
const requireLogin = require('../../utils/auth_guard')
const authState = require('../../utils/auth_state')
const api = require('../../utils/api')
Page({
  data: { pets: [], accountName: '', authUser: {}, settings: {}, showArchiveDialog: false, archiveTarget: null },
  onShow() { if (!requireLogin()) return; const storedPets = data.getPets(); const chosenId = data.getCurrentPetId(); const activePet = storedPets.find(pet => pet.id === chosenId) || storedPets.find(pet => !pet.archived) || storedPets[0] || null; if (activePet && activePet.id !== chosenId) data.setCurrentPetId(activePet.id); const pets = storedPets.slice().sort((a,b) => Number(a.archived) - Number(b.archived)).map(pet => { const avatarDisplay = pet.avatarConfigured ? (pet.avatar || '') : ((pet.photos || [])[0] || ''); return { ...pet, avatarDisplay, avatarCutout: Boolean(avatarDisplay && pet.avatarConfigured && pet.avatarIsCutout) } }); const accountName = data.getSettings().account || ''; const session = authState.getSession(); this.setData({ pets, accountName, authUser: session && session.user, settings: data.getSettings(), guestMode: !!(session && session.guest) }) },
  addPet() { if (authState.isGuest() && data.getPets().length >= 1) return wx.showToast({ title: '游客体验最多记录一只宠物', icon: 'none' }); wx.navigateTo({ url: '/pages/profile/profile?new=1' }) },
  goHome() { wx.redirectTo({ url: '/pages/home/home' }) },
  goMailbox() { wx.redirectTo({ url: '/pages/mailbox/mailbox' }) },
  selectPet(e) { data.setCurrentPetId(e.currentTarget.dataset.id); wx.navigateTo({ url: `/pages/profile/profile?id=${e.currentTarget.dataset.id}` }) },
  toggle(e) { const key = e.currentTarget.dataset.key; const value = e.detail.value; if (key === 'pushEnabled' && value && getApp().globalData.subscribeTemplateId && wx.requestSubscribeMessage) { const templateId = getApp().globalData.subscribeTemplateId; wx.requestSubscribeMessage({ tmplIds: [templateId], success: result => { data.saveSettings({ pushEnabled: result[templateId] === 'accept' }); this.onShow() }, fail: () => { data.saveSettings({ pushEnabled: false }); this.onShow() } }); return } data.saveSettings({ [key]: value }); this.onShow() },
  toggleQuiet(e) { const enabled = e.detail.value; data.saveSettings(enabled ? { quietMode: true, starMap: false, community: false } : { quietMode: false, starMap: true, community: true }); this.onShow() },
  toggleArchive(e) { const pet = data.getPet(e.currentTarget.dataset.id); if (pet) this.setData({ archiveTarget: pet, showArchiveDialog: true }) },
  cancelArchive() { this.setData({ showArchiveDialog: false, archiveTarget: null }) },
  holdArchive() {},
  confirmArchive() { const pet = this.data.archiveTarget; if (!pet) return this.cancelArchive(); const willArchive = !pet.archived; data.setArchived(pet.id, willArchive); this.setData({ showArchiveDialog: false, archiveTarget: null }); this.onShow(); wx.showToast({ title: willArchive ? '已安窝封存' : '档案已解封', icon: 'none' }) },
  openSettings() { wx.navigateTo({ url: '/pages/settings/settings' }) }, openWidget() { wx.navigateTo({ url: '/pages/widget/widget' }) },
  editAccount() { wx.showModal({ title: '账号管理', editable: true, placeholderText: '为这间小窝起一个称呼（可留空）', content: this.data.accountName, confirmText: '保存', success: result => { if (!result.confirm) return; data.saveSettings({ account: result.content.trim().slice(0,24) }); this.onShow() } }) },
  logout() {
    const guestMode = authState.isGuest()
    wx.showModal({
      title: guestMode ? '退出游客体验' : '退出登录',
      content: guestMode ? '游客档案和记录仍保存在本机。再次选择游客体验即可继续查看。' : '退出后，本机仍会保留这个账号的档案和记录；再次登录同一账号即可继续查看。',
      confirmText: '退出登录',
      success: async result => {
        if (!result.confirm) return
        try { await api.request('/api/auth/logout', 'POST', {}) } catch (error) {}
        authState.clearSession()
        wx.reLaunch({ url: '/pages/auth/auth' })
      }
    })
  }
})
