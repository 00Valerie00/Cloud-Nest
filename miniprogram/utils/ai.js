function context(pet) { return { name: pet.name || '', nickname: pet.nickname || '', species: pet.species || '', traits: Array.isArray(pet.traits) ? pet.traits : [] } }
function request(path, body, timeout = 45000) {
  const session = require('./auth_state').getSession()
  if (session && session.preview) return Promise.reject(new Error('本地预览不连接 AI 服务'))
  const base = getApp().globalData.apiBaseUrl
  if (!base) return Promise.reject(new Error('AI 服务尚未配置'))
  const header = { 'content-type': 'application/json' }
  if (session && session.token) header.Authorization = `Bearer ${session.token}`
  return new Promise((resolve, reject) => wx.request({
    url: `${base.replace(/\/$/, '')}${path}`,
    method: 'POST',
    data: body,
    timeout,
    header,
    success: response => {
      if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data || {})
      if (response.statusCode === 401 && !(session && session.guest)) {
        require('./auth_state').clearSession()
        wx.reLaunch({ url: '/pages/auth/auth' })
      }
      reject(new Error('AI 服务暂时不可用'))
    },
    fail: reject
  }))
}
function sanitize(content) {
  const unsafe = [/我.{0,3}回来/, /回来.{0,4}找你/, /我们.{0,6}见面/, /我.{0,4}去找你/, /我.{0,4}来找你/, /我.{0,4}带你走/, /跟我走吧/, /我在天堂等你/, /.{0,3}就能重逢/, /我.{0,5}再见到你/, /我.{0,4}复活/]
  if (unsafe.some(pattern => pattern.test(content || ''))) return '别担心我，我很好。你想我的时候，就把这份想念轻轻放在心里，也记得照顾好自己呀。'
  return content
}
function reply(pet, messages) {
  return request('/api/chat', { petId: pet.id || '', profileContext: context(pet), messages }).then(result => {
    const content = typeof result.content === 'string' ? result.content.trim() : ''
    if (!content) throw new Error('empty_ai_reply')
    return sanitize(content)
  })
}
function extractMemories(pet, userText) { return request('/api/memories/extract', { petId: pet.id || '', userText }, 30000).then(result => result.items || []) }
function describeImage(imageData) { return request('/api/image-description', { imageData }, 60000).then(result => result.description || '') }
function generateDailyLetter(pet, day) { const today = new Date(); const localDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`; return request('/api/daily-letter', { petId: pet.id || '', day: day || localDay, profileContext: context(pet) }).then(result => sanitize(result.content || '')) }
function localReply(pet) {
  const trait = pet && Array.isArray(pet.traits) ? pet.traits[0] : ''
  const replies = {
    '安静': '我很好，你不用担心。想我的时候，也记得温柔地照顾好自己。',
    '吵闹': '我很好呀！不要担心我，也要记得好好照顾自己哦。',
    '爱撒娇': '我很好呀，主人别担心我嘛。也要把自己照顾好，好不好？'
  }
  return replies[trait] || '别担心我呀，我很好。想我的时候，也记得照顾好自己。'
}
module.exports = { context, reply, extractMemories, describeImage, generateDailyLetter, localReply }
