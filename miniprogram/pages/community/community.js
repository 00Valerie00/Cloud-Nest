const data = require('../../utils/data')
const safety = require('../../utils/safety')
const api = require('../../utils/api')
const requireLogin = require('../../utils/auth_guard')
const groups = ['近一周离开', '近一个月离开', '近三个月离开', '更久以前的想念', '暂不加入']
function clockText(ts) { const d = new Date(ts); return `${d.getMonth()+1}月${d.getDate()}日` }
Page({
  data: { pet: null, petId: '', joined: '', posts: [], draft: '', showComposer: false, scrollTarget: '', groups: groups.slice(0, 4) },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/home/home' }) }) },
  onShow() { if (!requireLogin()) return; const settings = data.getSettings(); if (!settings.community || settings.quietMode) { wx.showToast({ title: '云伴小栈已关闭', icon: 'none' }); return wx.navigateBack() } const pets = data.getPets(); const chosenId = data.getCurrentPetId(); const pet = pets.find(item => item.id === chosenId) || pets.find(item => !item.archived) || pets[0] || null; if (!pet) return wx.navigateBack(); if (pet.id !== chosenId) data.setCurrentPetId(pet.id); const memberships = data.getJoined(); const auto = data.circleFor(pet.passingDate); const saved = memberships[pet.id]; const savedCircle = typeof saved === 'string' ? saved : saved && saved.circle; const automatic = !saved || (typeof saved === 'object' && saved.automatic); const circle = automatic ? auto : savedCircle; if (automatic && circle !== savedCircle) data.joinCircle(pet.id, circle, true); const joined = circle === '暂不加入' ? '' : circle; this.setData({ pet, petId: pet.id, joined }); this.refresh() },
  async refresh() { let remote = []; if (this.data.joined) { try { const response = await api.request(`/api/circles/${encodeURIComponent(this.data.joined)}/posts?limit=100`); remote = response.items || [] } catch (e) {} } const local = this.data.joined ? data.getPosts(this.data.joined) : []; const merged = [...new Map([...local, ...remote].map(item => [item.id, item])).values()]; const posts = merged.sort((a,b) => b.createdAt - a.createdAt).slice(0,100).map(item => ({ ...item, timeText: clockText(item.createdAt) })); this.setData({ posts, scrollTarget: posts.length ? `post-${posts[0].id}` : '' }) },
  selectGroup(e) { const group = e.currentTarget.dataset.group; if (!group || group === this.data.joined) return; data.joinCircle(this.data.petId, group); this.setData({ joined: group }); this.refresh() },
  leaveGroup() { data.joinCircle(this.data.petId, '暂不加入'); this.setData({ joined: '' }); this.refresh(); wx.showToast({ title: '已退出小栈', icon: 'none' }) },
  chooseGroup() { wx.showActionSheet({ itemList: groups, success: result => { const group = groups[result.tapIndex]; data.joinCircle(this.data.petId, group); this.setData({ joined: group === '暂不加入' ? '' : group }); this.refresh() } }) },
  input(e) { this.setData({ draft: e.detail.value }) },
  openComposer() { this.setData({ showComposer: true }) },
  closeComposer() { this.setData({ showComposer: false }) },
  stopTap() {},
  async publish() { const text = this.data.draft.trim(); if (!text) return wx.showToast({ title: '先写下一句话吧', icon: 'none' }); if (safety.filterText(text)) return wx.showModal({ title: '让小栈保持温和', content: '这段文字里有可能伤人的表达，请修改后再发布。', showCancel: false }); if (/1[3-9]\d{9}|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/.test(text)) return wx.showToast({ title: '请不要发布联系方式', icon: 'none' }); const post = data.savePost({ petId: this.data.petId, circle: this.data.joined, content: text.slice(0,300) }); try { await api.request(`/api/circles/${encodeURIComponent(this.data.joined)}/posts`, 'POST', { id: post.id, content: post.content }) } catch (e) {} this.setData({ draft: '', showComposer: false }); await this.refresh(); wx.showToast({ title: '留言已放进小栈', icon: 'success' }) }
})
