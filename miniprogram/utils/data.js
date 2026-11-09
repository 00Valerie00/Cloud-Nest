const KEYS = { pets: 'cloudNest.pets.v1', settings: 'cloudNest.settings.v1', chats: 'cloudNest.chats.v1', letters: 'cloudNest.letters.v1', stars: 'cloudNest.stars.v1', posts: 'cloudNest.posts.v1', joined: 'cloudNest.joined.v1' }
const DEFAULTS = { dailyLetters: true, starMap: true, community: true, autoExtractMemories: true, quietMode: false, pushEnabled: true, widgetStyle: 'A', account: '' }
const CURRENT_PET_KEY = 'cloudNest.currentPetId'
const MIGRATED_KEY = 'cloudNest.accountDataMigrated.v1'
let userScope = ''
let guestScope = false

function scopedKey(key, scope = userScope) { return scope ? `cloudNest.account.${encodeURIComponent(scope)}.${key.replace(/^cloudNest\./, '')}` : key }
function setUserScope(userId, options = {}) {
  const next = String(userId || '')
  if (next === userScope) { guestScope = !!options.guest; return }
  if (next && !userScope && !read(MIGRATED_KEY, false) && options.migrateLegacy !== false) {
    for (const key of Object.values(KEYS).concat(CURRENT_PET_KEY)) {
      const legacy = read(key, undefined)
      if (legacy === undefined) continue
      try {
        wx.setStorageSync(scopedKey(key, next), legacy)
        wx.removeStorageSync(key)
      } catch (error) {}
    }
    write(MIGRATED_KEY, true)
  }
  userScope = next
  guestScope = !!options.guest
}
function migrateUserScope(fromUserId, toUserId) {
  const from = String(fromUserId || '')
  const to = String(toUserId || '')
  if (!from || !to || from === to) return
  for (const key of Object.values(KEYS).concat(CURRENT_PET_KEY)) {
    try {
      const value = wx.getStorageSync(scopedKey(key, from))
      const destination = wx.getStorageSync(scopedKey(key, to))
      if (value !== '' && value != null && (destination === '' || destination == null)) wx.setStorageSync(scopedKey(key, to), value)
    } catch (error) {}
  }
}
function read(key, fallback) { try { const value = wx.getStorageSync(scopedKey(key)); return value === '' || value == null ? fallback : value } catch (e) { return fallback } }
function write(key, value) { wx.setStorageSync(scopedKey(key), value); return value }
function id() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` }
function ensureDefaults() { if (!read(KEYS.settings, null)) write(KEYS.settings, { ...DEFAULTS }); for (const key of ['pets', 'chats', 'letters', 'stars', 'posts', 'joined']) if (!read(KEYS[key], null)) write(KEYS[key], []) }
function seedPreviewDemo() {
  ensureDefaults()
  let pet = getPets()[0]
  if (!pet) {
    pet = savePet({
      name: '团子', nickname: '团子', species: '猫', sex: '女孩',
      birthday: '2019-04-18', passingDate: '2026-09-12',
      traits: ['爱撒娇'], habits: '最喜欢趴在窗边晒太阳。',
      story: '每个午后，它都会把自己团成一小团，陪我看窗外的云。',
      photos: [], memoryNotes: ['喜欢晒太阳时眯起眼睛', '听见零食袋就会跑来', '总爱睡在窗边'],
      imageDescriptions: [], archived: false, previewDemo: true
    })
  }
  setCurrentPetId(pet.id)

  if (!getChats(pet.id).length) {
    saveChat(pet.id, 'user', '今天路过以前常一起散步的地方了。')
    saveChat(pet.id, 'assistant', '那段路一定藏着很多熟悉的小细节。想起它的时候，可以在这里慢慢说。')
  }

  const today = dayKey(new Date())
  if (!getLetters(pet.id).some(letter => letter.day === today)) {
    saveLetter({ petId: pet.id, day: today, content: '今天的云很软，记得也给自己留一点慢下来的时间。想起我的时候，就在心里轻轻打个招呼吧。', createdAt: Date.now(), localSample: true })
  }

  const circle = circleFor(pet.passingDate)
  if (circle !== '暂不加入') {
    const memberships = getJoined()
    if (!memberships[pet.id]) joinCircle(pet.id, circle, true)
    if (!getPosts(circle).some(post => post.previewDemo)) {
      savePost({ petId: pet.id, circle, content: '今天又想起它晒太阳的样子了。原来那些很普通的小日子，后来都会变成很亮的回忆。', previewDemo: true })
      savePost({ petId: pet.id, circle, content: '路过它最喜欢的窗边，还是忍不住停下来了一会儿。慢慢来，想念也可以很温柔。', previewDemo: true })
    }
  }

  if (!getStars().length) {
    saveStar({ city: '杭州', phrase: '今天的晚风很轻，我把想念也放进云里。' })
    saveStar({ city: '成都', phrase: '谢谢你曾经把平凡的日子变得闪闪发亮。' })
    saveStar({ city: '厦门', phrase: '每次看到云团团的样子，都会想起你。' })
  }
  return pet
}
function getPets() { return read(KEYS.pets, []) }
function savePet(pet) { const pets = getPets(); const index = pets.findIndex(item => item.id === pet.id); if (guestScope && index < 0 && pets.length >= 1) { const error = new Error('guest_pet_limit'); error.code = 'guest_pet_limit'; throw error } if (index < 0) pets.unshift({ ...pet, id: id(), createdAt: Date.now(), archived: false }); else pets[index] = { ...pets[index], ...pet, updatedAt: Date.now() }; write(KEYS.pets, pets); return index < 0 ? pets[0] : pets[index] }
function getPet(petId) { return getPets().find(pet => pet.id === petId) || getPets()[0] || null }
function setArchived(petId, archived) { const pets = getPets().map(pet => pet.id === petId ? { ...pet, archived, archivedAt: archived ? Date.now() : null } : pet); write(KEYS.pets, pets); return pets }
function getSettings() { return { ...DEFAULTS, ...read(KEYS.settings, {}) } }
function saveSettings(patch) { return write(KEYS.settings, { ...getSettings(), ...patch }) }
function getChats(petId) { return read(KEYS.chats, []).filter(item => item.petId === petId).sort((a,b) => a.createdAt - b.createdAt) }
function saveChat(petId, role, content) { const chats = read(KEYS.chats, []); const item = { id: id(), petId, role, content, createdAt: Date.now() }; chats.push(item); write(KEYS.chats, chats); return item }
function getLetters(petId) { return read(KEYS.letters, []).filter(item => item.petId === petId).sort((a,b) => b.createdAt - a.createdAt) }
function saveLetter(letter) {
  const letters = read(KEYS.letters, [])
  const oldIndex = letters.findIndex(item => item.petId === letter.petId && item.day === letter.day)
  if (oldIndex >= 0) {
    const old = letters[oldIndex]
    if (!letter.regenerate || old.extraUsed) return old
    const updated = { ...old, content: letter.content, createdAt: letter.createdAt || Date.now(), localSample: !!letter.localSample, extraUsed: true }
    letters[oldIndex] = updated
    write(KEYS.letters, letters)
    return updated
  }
  const item = { id: id(), extraUsed: false, ...letter }
  delete item.regenerate
  letters.unshift(item)
  write(KEYS.letters, letters)
  return item
}
function dayKey(date) { const d = date instanceof Date ? date : new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function daysSince(date) { if (!date) return null; return Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000)) }
function circleFor(date) { const days = daysSince(date); if (days == null) return '暂不加入'; if (days < 7) return '近一周离开'; if (days < 30) return '近一个月离开'; if (days < 90) return '近三个月离开'; return '更久以前的想念' }
function getPosts(circle) { return read(KEYS.posts, []).filter(post => post.circle === circle).sort((a,b) => a.createdAt - b.createdAt) }
function savePost(post) { const posts = read(KEYS.posts, []); const item = { id: id(), ...post, createdAt: Date.now() }; posts.push(item); const keepIds = new Set(posts.filter(entry => entry.circle === item.circle).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map(entry => entry.id)); write(KEYS.posts, posts.filter(entry => entry.circle !== item.circle || keepIds.has(entry.id))); return item }
function getStars() { return read(KEYS.stars, []) }
function saveStar(star) { const stars = getStars(); const item = { id: id(), ...star, createdAt: Date.now() }; stars.push(item); write(KEYS.stars, stars); return item }
function getJoined() { return read(KEYS.joined, {}) }
function joinCircle(petId, circle, automatic = false) { const joined = getJoined(); joined[petId] = { circle, automatic }; write(KEYS.joined, joined) }

function getCurrentPetId() { return read(CURRENT_PET_KEY, '') }
function setCurrentPetId(petId) { return write(CURRENT_PET_KEY, petId || '') }

module.exports = { KEYS, DEFAULTS, setUserScope, migrateUserScope, ensureDefaults, seedPreviewDemo, getPets, savePet, getPet, setArchived, getSettings, saveSettings, getChats, saveChat, getLetters, saveLetter, dayKey, daysSince, circleFor, getPosts, savePost, getStars, saveStar, getJoined, joinCircle, getCurrentPetId, setCurrentPetId }
