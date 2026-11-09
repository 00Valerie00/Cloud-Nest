const data = require('../../utils/data')
const api = require('../../utils/api')
const requireLogin = require('../../utils/auth_guard')
const authState = require('../../utils/auth_state')
const { LOCATIONS, LOCATION_BY_CODE } = require('../../utils/nebula_locations')
const { createGlobe } = require('../../utils/globe_renderer')

const PREVIEW_CITY_KEY = 'cloudNest.nebula.previewCity'
const LOCATION_OPTIONS = LOCATIONS.filter(item => item.type !== 'city')

Page({
  data: {
    stars: [],
    phrase: '',
    city: '',
    locationQuery: '',
    locationMatches: [],
    showLocationOptions: false,
    selectedLocationName: '请选择省份、国家或大洋',
    selectedLocationCode: '',
    markers: [],
    participantCount: 0,
    ownLocationCode: '',
    ownLocationName: '',
    selectedNebula: null,
    consentChecked: false,
    connected: false,
    apiConfigured: false,
    localPreview: false,
    serviceMessage: '',
    globeUnavailable: false,
    autoRotating: true
  },

  onReady() {
    this.initGlobe()
  },

  onShow() {
    if (!requireLogin()) return
    this.setData({
      localPreview: authState.isPreview(),
      apiConfigured: !!getApp().globalData.apiBaseUrl
    })
    const settings = data.getSettings()
    if (!settings.starMap || settings.quietMode) {
      wx.showToast({ title: '同念星云已隐藏', icon: 'none' })
      return wx.navigateBack()
    }
    this.refresh()
    if (this._globe) this._globe.start()
  },

  onHide() {
    if (this._globe) this._globe.stop()
  },

  onUnload() {
    if (this._globe) this._globe.destroy()
    this._globe = null
  },

  initGlobe() {
    const query = wx.createSelectorQuery().in(this)
    query.select('#earthGlobe').fields({ node: true, size: true, rect: true }).exec(result => {
      const info = result && result[0]
      if (!info || !info.node) {
        this.setData({ globeUnavailable: true })
        return
      }
      const canvas = info.node
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const pixelRatio = system.pixelRatio || 1
      canvas.width = Math.round(info.width * pixelRatio)
      canvas.height = Math.round(info.height * pixelRatio)
      this._globeRect = info
      this._globePixelRatio = pixelRatio
      try {
        this._globe = createGlobe(canvas, { pixelRatio })
        this._globe.setMarkers(this.data.markers)
        this._globe.setAutoRotate(this.data.autoRotating)
        this._globe.zoomBy(this._zoomScale || 1)
        this._globe.start()
      } catch (error) {
        this._globe = null
        this.setData({ globeUnavailable: true })
      }
    })
  },

  async refresh() {
    const stored = data.getStars()
    let remote = []
    try {
      const response = await api.request('/api/stars')
      remote = response.items || []
    } catch (error) {}
    const merged = [...new Map([...stored, ...remote].map(item => [item.id, item])).values()]
    this.setData({ stars: merged.slice(-30).reverse() })
    this.refreshNebula()
  },

  async refreshNebula() {
    if (authState.isPreview()) {
      const ownLocationCode = wx.getStorageSync(PREVIEW_CITY_KEY) || ''
      const ownLocation = LOCATION_BY_CODE[ownLocationCode]
      const markers = ownLocation ? [{ ...ownLocation, locationCode: ownLocation.code, count: 1 }] : []
      this.setData({
        markers,
        participantCount: ownLocation ? 1 : 0,
        ownLocationCode: ownLocation ? ownLocation.code : '',
        ownLocationName: ownLocation ? ownLocation.name : '',
        connected: false,
        localPreview: true,
        serviceMessage: ''
      })
      if (ownLocation) {
        this.setData({ selectedLocationCode: ownLocation.code, selectedLocationName: ownLocation.name, locationQuery: ownLocation.name, showLocationOptions: false })
      }
      if (this._globe) this._globe.setMarkers(markers)
      return
    }
    try {
      const response = await api.request('/api/nebula')
      const markers = (response.locations || response.cities || []).map(item => {
        const code = item.locationCode || item.cityCode
        const location = LOCATION_BY_CODE[code]
        return location ? { ...location, locationCode: code, cityCode: code, count: Number(item.count) || 0 } : null
      }).filter(Boolean)
      const ownLocationCode = response.ownLocationCode || response.ownCityCode || ''
      const ownLocation = LOCATION_BY_CODE[ownLocationCode]
      this.setData({
        markers,
        participantCount: Number(response.participantCount) || 0,
        ownLocationCode: ownLocationCode,
        ownLocationName: ownLocation ? ownLocation.name : '',
        connected: true,
        localPreview: false,
        serviceMessage: '',
        selectedNebula: null
      })
      if (ownLocation) {
        this.setData({
          selectedLocationCode: ownLocationCode,
          selectedLocationName: ownLocation.name,
          locationQuery: ownLocation.name,
          showLocationOptions: false
        })
      }
      if (this._globe) this._globe.setMarkers(markers)
    } catch (error) {
      this.setData({
        connected: false,
        serviceMessage: error.message || '星云服务暂时不可用，请稍后重试'
      })
    }
  },

  locationSearchInput(e) {
    const query = String(e.detail.value || '').trim().toLowerCase()
    const matches = query ? LOCATION_OPTIONS.filter(item => item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query) || (item.iso2 || '').toLowerCase().includes(query)).slice(0, 30) : []
    this.setData({ locationQuery: e.detail.value || '', locationMatches: matches, showLocationOptions: !!query, selectedLocationCode: '', selectedLocationName: '请选择省份、国家或大洋', consentChecked: false })
  },

  toggleLocationOptions() {
    const show = !this.data.showLocationOptions
    const query = String(this.data.locationQuery || '').trim().toLowerCase()
    const matches = show
      ? (query ? LOCATION_OPTIONS.filter(item => item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query) || (item.iso2 || '').toLowerCase().includes(query)).slice(0, 30) : LOCATION_OPTIONS)
      : []
    this.setData({ showLocationOptions: show, locationMatches: matches })
  },

  chooseLocation(e) {
    const location = LOCATION_BY_CODE[e.currentTarget.dataset.code]
    if (!location) return
    this.setData({ locationQuery: location.name, selectedLocationCode: location.code, selectedLocationName: location.name, locationMatches: [], showLocationOptions: false, consentChecked: false })
  },

  consentChange(e) {
    this.setData({ consentChecked: (e.detail.value || []).indexOf('share-city') >= 0 })
  },

  async joinNebula() {
    if (!this.data.selectedLocationCode) return wx.showToast({ title: '请先匹配或选择位置', icon: 'none' })
    if (!this.data.consentChecked) return wx.showToast({ title: '请先确认位置展示说明', icon: 'none' })
    if (authState.isPreview()) {
      try {
        wx.setStorageSync(PREVIEW_CITY_KEY, this.data.selectedLocationCode)
        this.setData({ consentChecked: false })
        await this.refreshNebula()
        wx.showToast({ title: '本机预览已加入', icon: 'success' })
      } catch (error) {
        wx.showModal({ title: '保存失败', content: '无法在本机保存这次预览，请检查设备存储空间。', showCancel: false })
      }
      return
    }
    try {
      await api.request('/api/nebula/location', 'POST', { locationCode: this.data.selectedLocationCode, consent: true })
      this.setData({ consentChecked: false })
      wx.showToast({ title: '已加入同念星云', icon: 'success' })
      await this.refreshNebula()
    } catch (error) {
      const content = error.code === 'server_unconfigured'
        ? '这个小程序版本还没有配置线上星云服务地址。位置分享需要服务端保存，请先配置并部署 API。'
        : error.message || '位置暂时无法保存，请检查服务端状态后重试。'
      wx.showModal({ title: '未能加入星云', content, showCancel: false })
    }
  },

  withdrawNebula() {
    wx.showModal({
      title: '撤回位置分享？',
      content: authState.isPreview()
        ? '这会删除当前设备保存的本地演示位置，不影响正式用户数据。'
        : '撤回后，服务端会删除你的地点记录；星云图中的地区人数会随之更新。',
      confirmText: '撤回并删除',
      cancelText: '再想想',
      success: async result => {
        if (!result.confirm) return
        try {
          if (authState.isPreview()) {
            wx.removeStorageSync(PREVIEW_CITY_KEY)
            this.setData({ ownLocationCode: '', ownLocationName: '', consentChecked: false })
            await this.refreshNebula()
            wx.showToast({ title: '本机预览记录已删除', icon: 'success' })
            return
          }
          await api.request('/api/nebula/location', 'DELETE')
          this.setData({ ownLocationCode: '', ownLocationName: '', consentChecked: false })
          wx.showToast({ title: '位置记录已删除', icon: 'success' })
          this.refreshNebula()
        } catch (error) {
          wx.showToast({ title: '暂时无法删除，请稍后再试', icon: 'none' })
        }
      }
    })
  },

  toggleRotation() {
    const autoRotating = !this.data.autoRotating
    this.setData({ autoRotating })
    if (this._globe) this._globe.setAutoRotate(autoRotating)
  },

  resetGlobe() {
    this._zoomScale = 1
    if (this._globe) this._globe.reset()
    this.setData({ selectedNebula: null })
  },

  zoomGlobe(event) {
    const direction = event.currentTarget.dataset.direction === 'in' ? 1.22 : 1 / 1.22
    const current = this._zoomScale || 1
    this._zoomScale = Math.max(0.72, Math.min(1.62, current * direction))
    if (this._globe) this._zoomScale = this._globe.zoomBy(direction)
  },

  touchPosition(touch) {
    const rect = this._globeRect || { left: 0, top: 0 }
    const x = Number.isFinite(touch.clientX) ? touch.clientX : touch.pageX
    const y = Number.isFinite(touch.clientY) ? touch.clientY : touch.pageY
    return { x: x - rect.left, y: y - rect.top }
  },

  globeTouchStart(e) {
    const touches = e.touches || []
    if (touches.length >= 2) {
      const first = this.touchPosition(touches[0])
      const second = this.touchPosition(touches[1])
      this._wasPinching = true
      this._pinchDistance = Math.hypot(second.x - first.x, second.y - first.y)
      this._dragMoved = true
      this._dragStart = null
      this._dragLast = null
      return
    }
    if (this._wasPinching) return
    const touch = touches[0]
    if (!touch) return
    const point = this.touchPosition(touch)
    this._dragStart = point
    this._dragLast = point
    this._dragMoved = false
  },

  globeTouchMove(e) {
    const touches = e.touches || []
    if (touches.length >= 2 && this._wasPinching) {
      const first = this.touchPosition(touches[0])
      const second = this.touchPosition(touches[1])
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      if (this._pinchDistance > 0 && distance > 0 && this._globe) {
        const factor = distance / this._pinchDistance
        this._zoomScale = this._globe.zoomBy(factor)
      }
      this._pinchDistance = distance
      return
    }
    if (this._wasPinching) return
    const touch = e.touches && e.touches[0]
    if (!touch || !this._dragLast || !this._globe) return
    const point = this.touchPosition(touch)
    const dx = point.x - this._dragLast.x
    const dy = point.y - this._dragLast.y
    if (Math.abs(point.x - this._dragStart.x) + Math.abs(point.y - this._dragStart.y) > 7) this._dragMoved = true
    this._globe.dragBy(dx * this._globePixelRatio, dy * this._globePixelRatio)
    this._dragLast = point
  },

  globeTouchEnd(e) {
    if (e.touches && e.touches.length > 0) return
    const touch = e.changedTouches && e.changedTouches[0]
    if (touch && this._globe && !this._wasPinching && !this._dragMoved) {
      const point = this.touchPosition(touch)
      const marker = this._globe.pickCity(point.x * this._globePixelRatio, point.y * this._globePixelRatio)
      if (marker) this.setData({ selectedNebula: marker })
    }
    this._wasPinching = false
    this._pinchDistance = 0
    this._dragStart = null
    this._dragLast = null
  },

  input(e) { this.setData({ phrase: e.detail.value }) },
  cityInput(e) { this.setData({ city: e.detail.value }) },

  showStar(e) {
    const star = this.data.stars[Number(e.currentTarget.dataset.index)]
    if (star && star.phrase) wx.showModal({ title: '一份匿名想念', content: star.phrase, confirmText: '轻轻收下', showCancel: false })
  },

  async leaveStar() {
    const phrase = this.data.phrase.trim()
    if (!phrase) return wx.showToast({ title: '写一句想念再点亮吧', icon: 'none' })
    const star = data.saveStar({ phrase: phrase.slice(0, 60), city: this.data.city.trim().slice(0, 20) })
    try { await api.request('/api/stars', 'POST', star) } catch (error) {}
    this.setData({ phrase: '', city: '' })
    this.refresh()
    wx.showToast({ title: '星光已安放', icon: 'success' })
  },

  goHome() { wx.redirectTo({ url: '/pages/home/home' }) },
  goMailbox() { wx.redirectTo({ url: '/pages/mailbox/mailbox' }) },
  goMe() { wx.redirectTo({ url: '/pages/me/me' }) },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/home/home' }) }) }
})
