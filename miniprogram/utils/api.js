function request(path, method, data, options = {}) {
  const session = require('./auth_state').getSession()
  if (session && session.preview) {
    const error = new Error('本地预览不连接服务端')
    error.code = 'preview_mode'
    return Promise.reject(error)
  }
  const base = getApp().globalData.apiBaseUrl
  if (!base) {
    const error = new Error('云间小窝服务尚未连接，请检查服务地址配置')
    error.code = 'server_unconfigured'
    return Promise.reject(error)
  }
  const header = { 'content-type': 'application/json' }
  if (session && session.token) header.Authorization = `Bearer ${session.token}`
  return new Promise((resolve, reject) => wx.request({
    url: `${base.replace(/\/$/, '')}${path}`,
    method: method || 'GET',
    data,
    timeout: options.timeout || 20000,
    header,
    success: response => {
      if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data)
      const code = response.data && response.data.error
      // Guest login is intentionally anonymous. A 401 here means the running
      // backend is older than this mini-program (or the wrong service is on
      // the configured port), so keep the login page alive and explain how to
      // recover instead of redirecting back to the same page silently.
      if (response.statusCode === 401 && path === '/api/auth/guest') {
        const error = new Error('游客登录接口未生效。请停止旧后端进程，再用项目中的启动命令重新启动后端。')
        error.code = 'guest_endpoint_unauthorized'
        error.statusCode = response.statusCode
        return reject(error)
      }
      if (response.statusCode === 401 && path !== '/api/auth/code/request' && path !== '/api/auth/code/verify' && path !== '/api/auth/wechat') {
        require('./auth_state').clearSession()
        wx.reLaunch({ url: '/pages/auth/auth' })
      }
      const messages = {
        auth_not_configured: '登录服务尚未配置',
        auth_unavailable: '登录服务暂时不可用，请稍后重试',
        wechat_login_not_configured: '微信登录尚未配置，请稍后再试',
        wechat_login_failed: '微信登录失败，请重试',
        account_unavailable: '账号暂时无法创建，请稍后重试',
        auth_delivery_not_configured: '验证码发送服务尚未配置',
        auth_delivery_failed: '验证码发送失败，请稍后重试',
        code_rate_limited: '操作太频繁，请稍后再试',
        code_daily_limit: '今日验证码次数已用完，请明天再试',
        code_ip_limit: '请求次数过多，请稍后再试',
        verification_expired: '验证码已失效，请重新获取',
        verification_invalid: '验证码不正确，请检查后重试',
        invalid_phone: '请输入有效的手机号',
        invalid_email: '请输入有效的邮箱地址',
        auth_required: '游客会话已失效，请重新进入小窝',
        consent_required: '请先同意城市分享说明',
        invalid_city: '所选城市暂不支持，请重新选择',
        invalid_location: '所选位置暂不支持，请重新选择',
        nebula_storage_unavailable: '城市分享服务未就绪，请联系管理员更新服务端',
        not_found: '当前服务端尚未启用城市分享，请更新并重启服务',
        api_unreachable: '连接星云服务失败，请检查服务地址和网络'
      }
      const error = new Error(messages[code] || `服务暂时不可用（${response.statusCode}）`)
      error.code = code || 'request_failed'
      error.statusCode = response.statusCode
      reject(error)
    },
    fail: failure => {
      const error = new Error('连接星云服务失败，请检查服务地址和网络')
      error.code = 'api_unreachable'
      error.cause = failure
      reject(error)
    }
  }))
}
module.exports = { request }
