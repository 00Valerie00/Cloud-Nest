const data = require('../../utils/data')
const requireLogin = require('../../utils/auth_guard')
const authState = require('../../utils/auth_state')
function avatarPresentation(pet) {
  if (!pet) return { avatarDisplay: '', avatarCutout: false }
  const avatarDisplay = pet.avatarConfigured ? (pet.avatar || '') : ((pet.photos || [])[0] || '')
  return { avatarDisplay, avatarCutout: Boolean(avatarDisplay && pet.avatarConfigured && pet.avatarIsCutout) }
}
Page({
  data: { activePet: null, greeting: '欢迎回到云间小窝', settings: {} },
  resolveActivePet() { const pets = data.getPets(); const chosen = data.getCurrentPetId(); const pet = pets.find(item => item.id === chosen) || pets.find(item => !item.archived) || pets[0] || null; if (pet && pet.id !== chosen) data.setCurrentPetId(pet.id); return pet },
  onShow() { if (!requireLogin()) return; data.ensureDefaults(); const pet = this.resolveActivePet(); const settings = data.getSettings(); this.setData({ activePet: pet ? { ...pet, ...avatarPresentation(pet) } : null, settings, quietMode: settings.quietMode, previewMode: authState.isPreview(), greeting: pet ? `想念 ${pet.nickname || pet.name} 的今天` : '给想念留一间小窝' }) },
  navigate(page) { wx.navigateTo({ url: `/pages/${page}/${page}` }) },
  goProfile() { this.navigate('profile') }, goMailbox() { if (this.requirePet()) this.navigate('mailbox') }, goLetters() { if (!this.data.quietMode && this.requirePet()) this.navigate('letters') }, goStars() { if (!this.data.quietMode && this.data.settings.starMap) this.navigate('starmap') }, goCommunity() { if (!this.data.quietMode && this.data.settings.community && this.requirePet()) this.navigate('community') }, goWidget() { if (!this.data.quietMode) this.navigate('widget') }, goMe() { this.navigate('me') },
  requirePet() { const pet = this.resolveActivePet(); if (pet) { if (!this.data.activePet || this.data.activePet.id !== pet.id) this.setData({ activePet: { ...pet, ...avatarPresentation(pet) } }); return true } wx.showModal({ title: '先留下一份档案', content: '创建云窝档案后，就可以在这里继续。', confirmText: '去创建', success: r => { if (r.confirm) this.goProfile() } }); return false },
  addPet() { this.goProfile() }, openProfile() { this.goProfile() },
  switchPet() { const pets = data.getPets(); if (authState.isGuest()) { if (!pets.length) return this.addPet(); return this.goProfile() } if (!pets.length) return this.addPet(); wx.showActionSheet({ itemList: [...pets.map(pet => `${pet.name}${pet.archived ? ' · 已封存' : ''}`), '＋ 新建云窝档案'], success: result => { if (result.tapIndex === pets.length) return this.addPet(); data.setCurrentPetId(pets[result.tapIndex].id); this.onShow() } }) }
})
