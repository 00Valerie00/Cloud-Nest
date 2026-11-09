const data = require('../../utils/data')
const api = require('../../utils/api')
const ai = require('../../utils/ai')
const requireLogin = require('../../utils/auth_guard')
const authState = require('../../utils/auth_state')

const MEMORY_PROMPTS = [
  { key: 'favorite_food', title: '它最爱吃什么？', placeholder: '一句话就好，也可以跳过' },
  { key: 'small_habit', title: '它有什么小习惯？', placeholder: '例如一个常做的小动作（选填）' },
  { key: 'small_moment', title: '你常想起的一个小瞬间？', placeholder: '不需要完整故事，愿意时再写' }
]

function isTransparentPng(filePath) {
  return /\.png(?:$|[?#])/i.test(String(filePath || ''))
}

function saveLocalImage(filePath) {
  return new Promise(resolve => wx.saveFile({
    tempFilePath: filePath,
    success: result => resolve(result.savedFilePath),
    fail: () => resolve(filePath)
  }))
}

Page({
  data: {
    isEditing: false,
    petId: '',
    speciesOptions: ['猫', '狗', '兔子', '仓鼠', '鸟类', '爬宠', '鱼类', '其他'],
    sexOptions: ['不填写', '男孩', '女孩'],
    speciesIndex: 0,
    sexIndex: 0,
    today: data.dayKey(new Date()),
    personalityOptions: ['安静', '吵闹', '爱撒娇'],
    selectedTrait: '',
    memoryPrompts: MEMORY_PROMPTS,
    memories: [],
    memoryLoading: false,
    avatarPhotoPickerVisible: false,
    form: {
      name: '', nickname: '', species: '', customSpecies: '', sex: '', birthday: '', passingDate: '',
      traits: [], habits: '', story: '', photos: [], avatar: '', avatarConfigured: true,
      avatarIsCutout: false, memoryNotes: ['', '', ''], imageDescriptions: []
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/home/home' }) })
  },

  onLoad(options) {
    if (!requireLogin()) return
    if (options.new === '1' && authState.isGuest() && data.getPets().length >= 1) {
      wx.showModal({
        title: '游客体验限一只宠物',
        content: '游客模式只能建立一份宠物档案。你可以编辑现有档案；登录正式账号后可继续添加。',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/home/home' }) })
      })
      return
    }
    if (options.new === '1') return
    const id = options.id || data.getCurrentPetId()
    if (!id) return
    const pet = data.getPet(id)
    if (!pet) return
    const hasAvatarSetting = Object.prototype.hasOwnProperty.call(pet, 'avatarConfigured')
    const speciesIndex = Math.max(0, this.data.speciesOptions.indexOf(pet.species) < 0 ? this.data.speciesOptions.length - 1 : this.data.speciesOptions.indexOf(pet.species))
    const sexIndex = Math.max(0, this.data.sexOptions.indexOf(pet.sex))
    this.setData({
      isEditing: true,
      petId: id,
      speciesIndex,
      sexIndex,
      selectedTrait: (pet.traits || []).find(trait => this.data.personalityOptions.includes(trait)) || '',
      form: {
        ...this.data.form,
        ...pet,
        avatarConfigured: hasAvatarSetting ? pet.avatarConfigured : false,
        avatarIsCutout: pet.avatarIsCutout === undefined ? isTransparentPng(pet.avatar) : pet.avatarIsCutout,
        memoryNotes: Array.isArray(pet.memoryNotes) ? pet.memoryNotes : ['', '', ''],
        imageDescriptions: Array.isArray(pet.imageDescriptions) ? pet.imageDescriptions : [],
        customSpecies: speciesIndex === this.data.speciesOptions.length - 1 ? pet.species : ''
      }
    })
    this.loadMemories(id)
  },

  onShow() { if (!requireLogin()) return },

  input(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'memoryNote') {
      const index = Number(e.currentTarget.dataset.index)
      const notes = (this.data.form.memoryNotes || ['', '', '']).slice()
      notes[index] = e.detail.value
      return this.setData({ 'form.memoryNotes': notes })
    }
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  selectTrait(e) {
    const trait = e.currentTarget.dataset.trait
    if (!this.data.personalityOptions.includes(trait)) return
    this.setData({ selectedTrait: trait, 'form.traits': [trait] })
  },

  speciesChange(e) {
    const speciesIndex = Number(e.detail.value)
    this.setData({ speciesIndex, 'form.species': speciesIndex === this.data.speciesOptions.length - 1 ? '' : this.data.speciesOptions[speciesIndex] })
  },

  sexChange(e) {
    const sexIndex = Number(e.detail.value)
    this.setData({ sexIndex, 'form.sex': sexIndex === 0 ? '' : this.data.sexOptions[sexIndex] })
  },

  dateChange(e) {
    this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value })
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async result => {
        const file = result.tempFiles && result.tempFiles[0]
        if (!file || !file.tempFilePath) return
        const savedPath = await saveLocalImage(file.tempFilePath)
        this.setData({
          'form.avatar': savedPath,
          'form.avatarConfigured': true,
          'form.avatarIsCutout': isTransparentPng(savedPath) || isTransparentPng(file.tempFilePath)
        })
        wx.showToast({ title: '头像已选好', icon: 'success' })
      }
    })
  },

  openAvatarPhotoPicker() {
    if (!(this.data.form.photos || []).length) {
      wx.showToast({ title: '先在下面添加照片', icon: 'none' })
      return
    }
    this.setData({ avatarPhotoPickerVisible: true })
  },

  closeAvatarPhotoPicker() { this.setData({ avatarPhotoPickerVisible: false }) },

  stopAvatarPickerTap() {},

  selectAvatarPhoto(e) {
    const filePath = (this.data.form.photos || [])[Number(e.currentTarget.dataset.index)]
    if (!filePath) return
    this.setData({
      'form.avatar': filePath,
      'form.avatarConfigured': true,
      'form.avatarIsCutout': isTransparentPng(filePath),
      avatarPhotoPickerVisible: false
    })
    wx.showToast({ title: '已设为宠物头像', icon: 'success' })
  },

  removeAvatar() {
    this.setData({ 'form.avatar': '', 'form.avatarConfigured': true, 'form.avatarIsCutout': false })
  },

  choosePhotos() {
    const remain = 9 - (this.data.form.photos || []).length
    if (remain <= 0) return wx.showToast({ title: '最多添加 9 张', icon: 'none' })
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async result => {
        const file = result.tempFiles[0]
        if (!file) return
        const savedPath = await saveLocalImage(file.tempFilePath)
        this.setData({ 'form.photos': [...(this.data.form.photos || []), savedPath] })
        if (!getApp().globalData.apiBaseUrl) {
          wx.showToast({ icon: 'none', duration: 2600 })
          return
        }
        this.describePhoto(file.tempFilePath)
      }
    })
  },

  async describePhoto(filePath) {
    wx.showLoading({mask: true })
    try {
      const compressedPath = await new Promise(resolve => wx.compressImage({
        src: filePath,
        quality: 55,
        success: result => resolve(result.tempFilePath),
        fail: () => resolve(filePath)
      }))
      const base64 = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
        filePath: compressedPath,
        encoding: 'base64',
        success: result => resolve(result.data),
        fail: reject
      }))
      if (!base64 || base64.length > 7 * 1024 * 1024) throw new Error('image_too_large')
      const description = await ai.describeImage(`data:image/jpeg;base64,${base64}`)
      wx.hideLoading()
      if (!description) throw new Error('empty_description')
      wx.showModal({
        title: '照片中的客观描述',
        content: `${description}\n\n只在你确认后保存这段文字；图片本身不会存入云端记忆。`,
        confirmText: '保存描述',
        cancelText: '跳过',
        success: result => { if (result.confirm) this.saveImageDescription(description) }
      })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: '暂时无法描述，照片仍保存在本机', icon: 'none', duration: 2400 })
    }
  },

  async saveImageDescription(description) {
    const clean = String(description || '').trim().slice(0, 240)
    if (!clean) return
    const base = getApp().globalData.apiBaseUrl
    if (this.data.petId && base) {
      try {
        await api.request('/api/memories', 'POST', { petId: this.data.petId, content: clean, source: 'image_confirmed' }, { timeout: 30000 })
        this.loadMemories(this.data.petId)
        wx.showToast({ title: '已保存这条照片描述', icon: 'success' })
        return
      } catch (error) {}
    }
    const pending = [...(this.data.form.imageDescriptions || []), clean]
    this.setData({ 'form.imageDescriptions': pending })
    if (this.data.petId) data.savePet({ ...this.data.form, id: this.data.petId, imageDescriptions: pending })
    wx.showToast({ title: '描述已暂存在本机，联网后可同步', icon: 'none', duration: 2200 })
  },

  removePhoto(e) {
    const photos = (this.data.form.photos || []).slice()
    photos.splice(Number(e.currentTarget.dataset.index), 1)
    this.setData({ 'form.photos': photos })
  },

  async loadMemories(petId) {
    const id = petId || this.data.petId
    if (!id || !getApp().globalData.apiBaseUrl) {
      this.setData({ memories: [], memoryLoading: false })
      return
    }
    this.setData({ memoryLoading: true })
    try {
      const result = await api.request(`/api/memories?petId=${encodeURIComponent(id)}`)
      const sourceNames = { auto_extract: '从对话提取', profile_prompt: '档案提示卡', image_confirmed: '确认的照片描述' }
      this.setData({ memories: (result.items || []).map(item => ({ ...item, sourceName: sourceNames[item.source] || '已保存记忆' })) })
    } catch (error) {
      this.setData({ memories: [] })
    } finally {
      this.setData({ memoryLoading: false })
    }
  },

  deleteMemory(e) {
    const memory = this.data.memories[Number(e.currentTarget.dataset.index)]
    if (!memory) return
    wx.showModal({
      title: '删除这条记忆？',
      confirmText: '删除',
      cancelText: '保留',
      success: async result => {
        if (!result.confirm) return
        try {
          await api.request(`/api/memories/${encodeURIComponent(memory.id)}?petId=${encodeURIComponent(this.data.petId)}`, 'DELETE')
          const promptIndex = memory.source === 'profile_prompt'
            ? MEMORY_PROMPTS.findIndex(prompt => memory.content.startsWith(`${prompt.title}：`))
            : -1
          if (promptIndex >= 0) {
            const notes = (this.data.form.memoryNotes || ['', '', '']).slice()
            notes[promptIndex] = ''
            this.setData({ 'form.memoryNotes': notes })
            const pet = data.getPet(this.data.petId)
            if (pet) data.savePet({ ...pet, memoryNotes: notes })
          }
          this.loadMemories()
        } catch (error) {
          wx.showToast({ title: '暂时无法删除，请稍后再试', icon: 'none' })
        }
      }
    })
  },

  async syncMemories(petId, form) {
    if (!getApp().globalData.apiBaseUrl) return
    const memories = MEMORY_PROMPTS.map((prompt, index) => ({ prompt: prompt.title, content: (form.memoryNotes || [])[index] || '' })).filter(item => item.content.trim())
    await api.request('/api/memories/profile', 'PUT', { petId, memories }, { timeout: 30000 })
    const pending = form.imageDescriptions || []
    const remaining = []
    for (const content of pending) {
      try {
        await api.request('/api/memories', 'POST', { petId, content, source: 'image_confirmed' }, { timeout: 30000 })
      } catch (error) {
        remaining.push(content)
      }
    }
    const current = data.getPet(petId)
    if (current) data.savePet({ ...current, imageDescriptions: remaining })
  },

  async save() {
    const form = { ...this.data.form }
    if (!form.name.trim()) return wx.showToast({ title: '请填写宠物名字', icon: 'none' })
    if (!form.species && !form.customSpecies) return wx.showToast({ title: '请选择或填写物种', icon: 'none' })
    if (!this.data.personalityOptions.includes(this.data.selectedTrait)) return wx.showToast({ title: '请选择一个性格标签', icon: 'none' })
    if (form.customSpecies) form.species = form.customSpecies.trim()
    form.traits = [this.data.selectedTrait]
    let saved
    try {
      saved = data.savePet({ ...form, id: this.data.petId || undefined })
    } catch (error) {
      if (error.code === 'guest_pet_limit') return wx.showToast({ title: '游客体验最多记录一只宠物', icon: 'none' })
      return wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
    }
    data.setCurrentPetId(saved.id)
    this.setData({ petId: saved.id, isEditing: true })
    const session = authState.getSession()
    const canSyncToCloud = getApp().globalData.apiBaseUrl && session && !session.preview
    if (canSyncToCloud) {
      wx.showLoading({ title: '正在同步记忆', mask: true })
      try {
        await this.syncMemories(saved.id, saved)
      } catch (error) {
        wx.hideLoading()
        wx.showModal({
          title: '档案已保存在本机',
          content: '云端记忆暂时没有同步成功。',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
      wx.hideLoading()
    }
    wx.showToast({ title: '档案已安放', icon: 'success' })
    setTimeout(() => wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/home/home' }) }), 550)
  }
})
