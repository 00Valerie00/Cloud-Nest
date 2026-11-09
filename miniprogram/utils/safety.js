const patterns = [/不想活了/, /想自杀/, /想死/, /自伤/, /伤害自己/, /结束生命/, /活不下去/, /去死了算了/, /割腕/, /跳楼/]
function isDistress(text) { return patterns.some(pattern => pattern.test(text || '')) }
function distressCount(messages) { return messages.filter(item => item.role === 'user' && isDistress(item.content)).length }
function filterText(text) { const blocked = ['傻逼', '废物', '去死', '垃圾']; return blocked.some(word => (text || '').includes(word)) }
module.exports = { isDistress, distressCount, filterText }
