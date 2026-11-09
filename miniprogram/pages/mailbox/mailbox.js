const data = require('../../utils/data')
const ai = require('../../utils/ai')
const safety = require('../../utils/safety')
const requireLogin = require('../../utils/auth_guard')
function timeText(ts) { const d = new Date(ts); return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
Page({
  data: { pet: {}, petId: '', messages: [], draft: '', busy: false, scrollTo: '' },
  onShow() { if (!requireLogin()) return; const petId = data.getCurrentPetId(); const pet = data.getPet(petId); if (!pet) return wx.navigateBack(); this.pet = pet; const avatarDisplay = pet.avatarConfigured ? (pet.avatar || '') : ((pet.photos || [])[0] || ''); const avatarCutout = Boolean(avatarDisplay && pet.avatarConfigured && pet.avatarIsCutout); this.setData({ pet: { ...pet, avatarDisplay, avatarCutout }, petId }); this.loadMessages() },
  loadMessages() {
    const messages = data.getChats(this.data.petId).map(item => ({
      ...item,
      content: item.role !== 'user' && !String(item.content || '').trim()
        ? '这条回信没有生成出来，请再发一句。'
        : item.content,
      timeText: timeText(item.createdAt)
    }))
    this.setData({ messages, scrollTo: messages.length ? `msg-${messages.length-1}` : '' })
  },
  goHome() { wx.redirectTo({ url: '/pages/home/home' }) },
  goMe() { wx.redirectTo({ url: '/pages/me/me' }) },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/home/home' }) }) },
  input(e) { this.setData({ draft: e.detail.value }) },
  async send() {
    const text = this.data.draft.trim()
    if (!text || this.data.busy) return
    data.saveChat(this.data.petId, 'user', text)
    const distressCount = safety.distressCount(data.getChats(this.data.petId))
    this.setData({ draft: '', busy: true })
    this.loadMessages()
    const history = data.getChats(this.data.petId).slice(-40).map(item => ({
      role: item.role === 'user' ? 'user' : 'assistant', content: item.content
    }))
    let content
    try {
      content = await ai.reply(this.pet, history)
    } catch (error) {
      content = ai.localReply(this.pet)
      wx.showToast({ title: 'AI 暂时没有生成回复，先显示备用回信', icon: 'none', duration: 2400 })
    }
    if (!String(content || '').trim()) content = ai.localReply(this.pet)
    data.saveChat(this.data.petId, 'assistant', content)
    this.setData({ busy: false })
    this.loadMessages()
    if (distressCount === 2) this.showSupport()
    const settings = data.getSettings()
    if (settings.autoExtractMemories && getApp().globalData.apiBaseUrl) ai.extractMemories(this.pet, text).catch(() => {})
  },
  showSupport() { wx.showModal({ title: '想请你先照顾好自己', content: '听起来你正在承受很重的痛苦。悲伤没有错，但你不必独自面对。可以联系信任的人、当地心理援助服务或专业心理咨询师；如果你正处于危险中，请立即联系当地急救或紧急服务。', confirmText: '我知道了', showCancel: false }) }
})
