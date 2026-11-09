# 云间小窝

原生微信小程序 MVP，当前仓库从零搭建。设计遵循安静、温柔、低干预；不含点赞、排行、热度、私聊或社交引流。

## 打开项目

1. 安装并打开微信开发者工具。
2. 导入当前目录，项目类型选择「小程序」，入口目录为 `miniprogram/`（项目配置已设置）。
3. `project.config.json` 已配置当前小程序 AppID。README 此前的占位说明已过时；发布前仍需在微信公众平台核对账号、主体、备案、服务类目和版本状态。
4. 首页前需要进入游客小窝。登录页只保留匿名游客入口；每台设备最多建立一份宠物档案，无需微信或手机号授权。

## 接入 DeepSeek

API Key 只放在服务端环境变量，不要写进小程序代码。项目根目录的 `.env` 已加入忽略列表；本地开发可从 `.env.example` 复制后填入配置，后端会自动读取它。

```sh
python3 -m pip install -r backend/requirements.txt
python3 backend/server.py
```

服务由 FastAPI 提供、使用 Uvicorn 运行。开发者工具模拟器连接 `127.0.0.1:8787`；手机真机调试使用 `启动后端.txt` 中的 `--host 0.0.0.0` 命令，并在 `miniprogram/utils/debug_config.js` 将 `phoneApiBaseUrl` 配为电脑当前 Wi-Fi IPv4 地址。当前开发机地址为 `10.31.1.143`，地址变化时需要同步更新。手机与电脑应在同一局域网，Windows 防火墙需允许 Python/Uvicorn 接受专用网络的入站连接。正式版需要 HTTPS，并将域名加入小程序 request 合法域名。生产模型端点使用 DeepSeek Chat Completions API；模型名可用环境变量覆盖。固定伦理提示词仅由服务端注入，不采信客户端传入的提示词。

DeepSeek 官方接口文档：[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)。

## 游客会话与服务连接

- 游客首次进入时，后端通过随机设备密钥创建匿名会话；不收集微信身份、手机号或邮箱。游客可使用五个功能模块，但宠物档案保存在本机，每台设备最多一只；清除小程序数据后无法找回原匿名身份。
- 游客匿名会话由 `/api/auth/guest` 创建，后端为每台设备保存随机密钥的哈希，并用 Bearer 会话隔离云端记忆。无需微信 AppSecret、短信或邮箱服务。
- 开发者工具连接本机后端后，可直接测试 AI 聊天、来信、星图和小栈。正式环境需配置 HTTPS `productionApiBaseUrl`；未配置时游客无法连接云端功能。
- 如果线上服务位于可信反向代理之后，可设置 `CLOUD_NEST_TRUST_PROXY=1`，但必须让该代理覆盖/追加可信的 `X-Forwarded-For` 客户端地址；不要直接信任任意客户端传入的该头部。
- 后端业务接口均需有效 Bearer 会话；匿名游客会话由 `/api/auth/guest` 创建。正式环境需在 `miniprogram/utils/debug_config.js` 配置 `productionApiBaseUrl` HTTPS 地址，并加入小程序 request 合法域名。

本地调试所需变量见 [`.env.example`](.env.example)。部署时仍应通过部署平台的密钥管理注入环境变量，不要上传 `.env`。

Linux 云服务器的 Docker、持久化 SQLite 与 Caddy HTTPS 部署步骤见 [`DEPLOYMENT.md`](DEPLOYMENT.md)。

本机游客体验可直接启动后端并在微信开发者工具选择“以游客身份进入”；会创建匿名服务会话，用于本机 AI 和云端功能验证。正式环境关闭 `CLOUD_NEST_DEV_AUTH` 并使用 HTTPS。手机号、邮箱和微信认证路由仍保留在后端，但登录页不再提供这些入口。

### 记忆采集与低召回保护

- 信箱开启“自动提取对话记忆”后，只把用户自己的最新发言交给服务端做事实抽取；只有能逐字对应原话的宠物事实才会保存。用户可以关掉开关，并在云窝档案查看、逐条删除已同步记忆。
- 档案里的三条小提示全部选填。照片只在连接 AI 后发送做客观描述；用户点“保存描述”后才保存文字，图片不进入记忆表。
- 记忆检索使用本地 SQLite 中的中文字符 n-gram 稀疏向量，不需要单独的 embedding API。它适合记忆条数很少的轻量检索，但不等同于语义向量模型；相似度低于 `MEMORY_SIMILARITY_THRESHOLD`（默认 `0.16`）时会走安全兜底。
- 低召回时仅让模型判断情绪类别，实际回复使用固定模板；具体回忆问题命中记录时直接展示保存的原句，不让模型扩写。普通情绪对话的生成模型不会收到召回到的往事，只收到宠物基础人设和当前对话。对话中的事实记忆和照片描述仍需连接已配置 DeepSeek Key 的服务端才能实际体验。
- 登录接口创建服务端会话，后端业务 API 校验 Bearer token；云端宠物记忆按 `user_id` 隔离。档案、聊天、照片和来信本身仍保存在本机，不提供跨设备云同步。

## 自测

运行服务端记忆安全单元测试：

```sh
cd backend
python3 -m unittest test_memories.py
python3 -m py_compile server.py test_memories.py
```

JavaScript 语法检查可用 Node.js 执行 `node --check` 检查 `miniprogram/app.js`、`miniprogram/utils/ai.js`、`miniprogram/utils/data.js`、`miniprogram/utils/api.js`、`miniprogram/pages/mailbox/mailbox.js`、`miniprogram/pages/profile/profile.js` 和 `miniprogram/pages/settings/settings.js`。微信开发者工具的页面预览及联网验证需要本机可访问的服务端；详细手动边界场景见 [`MEMORY_EDGE_CASES.md`](MEMORY_EDGE_CASES.md)。

## MVP 数据与隐私

- 档案、照片路径、对话历史、来信、设置和星图/小栈的本机副本保存在微信小程序本地存储中；卸载或清除小程序数据会影响本机记录。首次登录会把旧版本的本机记录归入第一个登录的账号；之后本机数据按账号分开保存。多设备云同步尚未接入。
- 游客使用随机匿名设备标识和服务会话；后端不收集真实姓名、微信身份、手机号或邮箱。云端记忆按匿名游客标识隔离。档案、照片路径、对话历史、来信、设置和本机副本仍保存在设备上。
- 只有设置 `apiBaseUrl` 并发送模型请求时，当前档案字段和信箱历史才会发到你配置的服务端，再由服务端转发 DeepSeek。AI Key 不会下发到小程序。
- `backend/schema.sql` 给出托管部署所需的 SQLite 关系结构。AI 代理本身不把请求正文写入日志或数据库。
- 同念星云不会自动请求 GPS。用户主动搜索或选择中国省级地区、国家或大洋并勾选同意后，服务端才会为该账号保存位置代码和同意时间；用户可在星图页随时撤回并删除。`POST /api/nebula/location` 写入选择，`GET /api/nebula/locations` 返回匿名地区聚合，`GET /api/nebula/location` 返回当前账号自己的选择，`DELETE /api/nebula/location` 撤回。有参与者的地区都会显示匿名星点，不公开账号、昵称或个人坐标；旧版 `/api/nebula` 和 `cityCode` 字段仍兼容。星语和圈子留言在配置服务端后同步到 SQLite；星语的文本城市仍由用户手动填写。
- 云伴小栈按宠物离世日期建议分组；内容为匿名纯文字，没有作者资料、私聊、@、点赞或回复层级。敏感词与联系方式有简单拦截。
- 本地每日来信会在小程序启动或回到前台时按日期生成一次。微信后台定时任务和订阅消息推送需要小程序 AppID、服务端登录态、订阅消息模板及云端调度配置；这些账号级配置尚未提供，因此此版本不承诺应用关闭时仍定时推送。
- 云窗提供两种样式的本机预览和设置。系统桌面小组件的实际注册与投放依赖微信/设备支持，不能仅靠普通小程序页面代码保证跨平台一致；iPhone 按轻量快捷入口展示。

## 页面

启动页、登录与隐私说明、首页、云窝档案、悄悄话信箱、云间来信、同念星云、云伴小栈、云窗、我的、设置与隐私。

远期 3D 星球、宠物模型、乐园及纪念 PDF 均未开发。
