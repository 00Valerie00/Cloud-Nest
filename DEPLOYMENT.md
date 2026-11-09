# 后端上线与登录接通

仓库里的后端使用 FastAPI 和 Uvicorn 提供 HTTP 服务，数据库使用 SQLite。下面的容器部署配置适合先把小程序上线给一批用户体验；数据库文件保存在 Docker 持久化卷中。若用户量和写入量继续增长，再迁移到托管数据库。

## 需要准备

- 一台可运行 Docker Engine 和 Docker Compose 的 Linux 云服务器。
- 一个指向该服务器公网 IP 的 API 子域名，例如 `api.example.com`。
- 云平台防火墙开放 TCP 80、443；不要把 8787 端口直接公开。
- 微信小程序 AppID，以及通过审核并配置好 request 合法域名的 HTTPS API 子域名。
- 当前游客体验不需要微信 AppSecret、短信或邮箱验证码服务；这些认证接口仅作为后端预留能力。

## 部署

1. 将项目复制到服务器，创建生产环境变量文件：

   ```sh
   cp deployment/production.env.example deployment/production.env
   ```

2. 编辑 `deployment/production.env`：填写 `API_DOMAIN` 和 AI 服务密钥。`CLOUD_NEST_AUTH_SECRET`、微信 AppSecret、短信和 SMTP 配置仅在重新启用相应认证方式时需要。不要把真实密钥提交到 Git。

   可在服务器上生成会话密钥：

   ```sh
   python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
   ```

3. 在 DNS 中给 `API_DOMAIN` 添加 A 记录，指向服务器公网 IP。Caddy 会在域名解析、端口可达后自动申请和续期 HTTPS 证书。

4. 在服务器项目目录启动：

   ```sh
   docker compose --env-file deployment/production.env up -d --build
   ```

   服务启动时会执行 `backend/schema.sql` 初始化 SQLite 表。数据库保存在 `cloud_nest_data` 持久化卷中。

5. 检查 `https://你的 API_DOMAIN/health` 是否返回 `{"ok":true,...}`。然后在微信小程序后台把 `https://你的 API_DOMAIN` 配置为 request 合法域名。

6. 将 `miniprogram/utils/debug_config.js` 中的 `productionApiBaseUrl` 设为该 HTTPS 地址，并在微信公众平台配置为 request 合法域名；重新编译并上传体验版。游客匿名会话以及 AI、星图和小栈功能都依赖该地址。

## 游客体验

小程序登录页只提供游客体验，不要求微信身份、手机号或邮箱。首次进入时，服务端会通过随机设备密钥创建匿名会话；同一安装再次进入会恢复原匿名身份。每台设备最多保存一份本机宠物档案。游客身份不支持跨设备找回；清除小程序数据后，原游客身份无法恢复。

## 其他登录方式

- **手机号验证码**：正式环境需要腾讯云短信密钥、短信应用 ID、签名和模板 ID。生产配置必须保持 `CLOUD_NEST_DEV_AUTH=0`；本地开发才使用 `1` 并在页面读取调试验证码。
- **微信一键登录**：需要 `WECHAT_MINIAPP_APP_ID` 与 `WECHAT_MINIAPP_APP_SECRET`。AppSecret 只放在服务器环境变量中；当前页面走 `wx.login` 身份登录，不会读取微信昵称或手机号。
- **邮箱验证码**：需要配置 SMTP 主机、账号、密码和发件人。

手机号、邮箱和微信身份登录接口仍保留在后端，但当前小程序登录页不展示这些选项，也不会请求微信手机号授权。

## 本地验证游客功能

开发者工具在 `miniprogram/app.js` 中自动连接 `http://127.0.0.1:8787`。启动后端并配置 AI 服务密钥后，直接在小程序选择游客体验，即可验证 AI、星图和小栈接口；本地游客也会获得匿名服务会话。

## 维护

- 定期备份 `cloud_nest_data` 卷中的 SQLite 数据库。
- 正式环境不要打开开发验证码模式；妥善保管生产会话密钥、微信 AppSecret、短信和 SMTP 凭据。
- 当前项目仍把宠物档案、照片路径、聊天和来信保存在各自设备；上线后共享的是接入后端的登录、星语、小栈和用户自愿提交的城市聚合等数据。
