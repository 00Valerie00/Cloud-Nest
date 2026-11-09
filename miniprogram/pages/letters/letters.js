const data = require('../../utils/data')
const ai = require('../../utils/ai')
const requireLogin = require('../../utils/auth_guard')
Page({
  data: { pet: {}, history: [], latest: null, settings: {}, today: '', hasTodayLetter: false, canRegenerate: false, regenerating: false, buttonText: '生成今天的来信', buttonDisabled: false },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/home/home' }) }) },
  onShow() { if (!requireLogin()) return; const pet = data.getPet(data.getCurrentPetId()); if (!pet) return wx.navigateBack(); this.setData({ pet, settings: data.getSettings(), today: data.dayKey(new Date()) }); const app = getApp(); app.generateTodayLetters().then(() => this.refresh()); this.refresh() },
  refresh() {
    if (!this.data.pet.id) return
    const all = data.getLetters(this.data.pet.id)
    const latest = all.find(letter => letter.day === this.data.today) || null
    const hasTodayLetter = !!latest
    const canRegenerate = hasTodayLetter && !latest.extraUsed
    const buttonText = this.data.regenerating ? (hasTodayLetter ? '正在再写一封' : '正在写今天的信') : (hasTodayLetter ? (canRegenerate ? '再来一封（今日剩1次）' : '今日机会已用完') : '生成今天的来信')
    this.setData({ history: all.filter(letter => !latest || letter.id !== latest.id), latest, hasTodayLetter, canRegenerate, buttonText, buttonDisabled: this.data.regenerating || (hasTodayLetter && !canRegenerate) })
  },
  async regenerate() {
    if (this.data.regenerating) return
    this.setData({ regenerating: true, buttonText: this.data.hasTodayLetter ? '正在再写一封' : '正在写今天的信', buttonDisabled: true })
    wx.showLoading({ title: this.data.hasTodayLetter ? '正在再写一封' : '正在写今天的信', mask: true })
    try {
      const today = data.dayKey(new Date())
      const current = data.getLetters(this.data.pet.id).find(letter => letter.day === today)
      if (!current) {
        const app = getApp()
        if (app._dailyGeneration) {
          await app._dailyGeneration
        } else {
          const content = await ai.generateDailyLetter(this.data.pet, today)
          data.saveLetter({ petId: this.data.pet.id, day: today, content, createdAt: Date.now() })
        }
        this.setData({ today })
        this.refresh()
        if (!this.data.hasTodayLetter) throw new Error('daily_letter_unavailable')
      } else {
        if (current.extraUsed) {
          wx.showToast({ title: '今天的再来一封机会已用完', icon: 'none' })
          return
        }
        const content = await ai.generateDailyLetter(this.data.pet, today)
        data.saveLetter({ petId: this.data.pet.id, day: today, content, createdAt: Date.now(), regenerate: true })
      }
    } catch (error) {
      wx.showToast({ title: '来信暂时没有生成，请稍后再试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ regenerating: false, today: data.dayKey(new Date()) })
      this.refresh()
    }
  },
  toggleDaily(e) { const dailyLetters = e.detail.value; data.saveSettings({ dailyLetters }); this.setData({ 'settings.dailyLetters': dailyLetters }); if (dailyLetters) getApp().generateTodayLetters() }
})
