const data = require('./utils/data')
const authState = require('./utils/auth_state')
const debugConfig = require('./utils/debug_config')

App({
  globalData: {
    // 登录与业务 API 共用此地址；正式版必须使用已备案并加入合法域名的 HTTPS 服务。
    apiBaseUrl: "",
    localDebugAuth: false,
    subscribeTemplateId: '',
    slogan: '云间有小窝，思念有归处'
  },
  onLaunch() {
    // DevTools uses localhost on the Mac. A real phone needs the Mac's Wi-Fi IP.
    // Production builds remain unconfigured until an HTTPS service URL is added.
    try {
      const platform = wx.getSystemInfoSync().platform
      if (platform === 'devtools') {
        this.globalData.apiBaseUrl = 'http://127.0.0.1:8787'
        this.globalData.localDebugAuth = true
      } else {
        const envVersion = wx.getAccountInfoSync().miniProgram.envVersion
        if (envVersion === 'develop') {
          this.globalData.apiBaseUrl = debugConfig.phoneApiBaseUrl
          this.globalData.localDebugAuth = true
        } else this.globalData.apiBaseUrl = debugConfig.productionApiBaseUrl || ''
      }
    } catch (error) {}
    const session = authState.getSession()
    if (!session) return
    data.setUserScope(session.user.id, { migrateLegacy: !session.preview && !session.guest, guest: !!session.guest })
    data.ensureDefaults()
    this.generateTodayLetters()
  },
  onShow() {
    const session = authState.getSession()
    if (!session) return
    data.setUserScope(session.user.id, { migrateLegacy: !session.preview && !session.guest, guest: !!session.guest })
    this.generateTodayLetters()
  },
  async generateTodayLetters() {
    const session = authState.getSession()
    if (!session || (session.guest && !session.remoteGuest)) return
    if (this._dailyGeneration) return this._dailyGeneration
    const settings = data.getSettings()
    if (!settings.dailyLetters || settings.quietMode) return
    if (Date.now() < (this._dailyRetryAfter || 0)) return
    this._dailyGeneration = (async () => {
      const today = data.dayKey(new Date())
      const pets = data.getPets().filter(pet => !pet.archived)
      let failed = false
      for (const pet of pets) {
        const letters = data.getLetters(pet.id)
        if (letters.some(letter => letter.day === today)) continue
        try {
          const { generateDailyLetter } = require('./utils/ai')
          const content = await generateDailyLetter(pet, today)
          data.saveLetter({ petId: pet.id, day: today, content, createdAt: Date.now() })
        } catch (error) {
          failed = true
        }
      }
      if (failed) this._dailyRetryAfter = Date.now() + 60000
      return !failed
    })()
    try { await this._dailyGeneration } finally { this._dailyGeneration = null }
  }
})
