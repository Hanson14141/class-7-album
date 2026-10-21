# AI 编辑指引

适用于本仓库。用户的明确任务优先于本文件；先根据任务阅读相关源文件，避免仅凭本指引推测实现。

## 从这里开始

1. 阅读 `AI_HANDOFF.md` 的当前状态、最新接手记录及持续维护要求。
2. 阅读 `README.md` 了解运行方式，再阅读 `UPDATE_NOTES.md` 最新日期章节；旧章节为历史，不能覆盖当前规则。
3. 修改前按需要阅读 `docs/DEVELOPMENT.md` 和 `docs/DEPLOY.md`。
4. 每次任务完成或中断前，必须继续更新同一份 `AI_HANDOFF.md`：刷新当前状态，并在接手记录顶部追加实际改动、验证、部署状态、未完成事项及下一步。保留旧记录，不能只在聊天中说明。

这是腾讯云 CloudBase 的完整应用源码。GitHub 用于保存代码；前端、HTTP 云函数、PostgreSQL 和私有图片存储共同提供功能。没有自动部署工作流。

## 编辑入口

- 基础界面在 `baseline/public/`；CloudBase 适配及新增功能在 `src/`，通过 `build.cjs` 拼接和构建。
- 本次评论榜重点阅读 `src/comment-contest-*`、`src/comment-interactions-*`、`src/weekly-contest-ui.js` 与 `build.cjs`。
- 签到积分重点阅读 `checkin-points.sql`、`src/checkin-points-*`、`src/photo-likes-api.ts`、`src/comment-interactions-api.ts` 与 `build.cjs`。修改时保留点赞/评论及奖励的事务一致性；周点赞重置不应重复发放同一项的积分。
- 每日照片商城阅读 photo-mall.sql、src/mall-*；评论库存表情阅读 comment-emoji.sql、src/comment-emoji-* 和评论/榜单接线。价格由数据库按等级固定为10/20/30/40，货架每账号每天固定五张，扣分和库存需同事务。旧mall-goods已停用，不再作为上架入口。
- 数据库完整初始化在 `schema.sql`，增量升级在对应 SQL 文件及 `scripts/apply-*.cjs`。修改共享 SQL 逻辑时检查完整 schema 和增量脚本是否一致。
- 不直接编辑生成文件：`public/`、`hosting/`、`functions/class7-photo-api/public/`、`functions/class7-photo-api/index.cjs`、`src/accounts.ts`、`src/photo-api.ts`。下次构建会覆盖它们。
- `build.cjs` 使用字符串替换；插入包含 `$`/`$$` 的 JS 源码时注意替换字符串的特殊含义，必要时用函数返回替换文本。

## 保留的行为

- 黑白主题、自适应瀑布墙、桌面三至四列、完整/流动浏览、原有手机布局。
- 上传最多三个任务；超过12 MB的静态图可压缩至6 MB以内；保留说明编辑、旋转、下载及已有账号管理。
- 照片与评论按北京时间每周一00:00更新点赞机会，累计总赞保留。本周取消不删除往周点赞；关联身份每周每项只计一赞。不要把计票退回每个账号终身一赞。
- 评论来源照片必须可辨认，跳转能定位原评论；排名按服务端全局数据计算，不能仅按当前已加载页排序。
- 榜单按需加载和分页；保留图片队列、懒加载、签名缓存与照片墙合成动画。避免为榜单全量下载相册或加入频繁轮询。
- 公开仅返回点赞总数，不暴露点赞者身份。回复提醒的登录账号信息仅返回给有权限的收件人。

## 本地验证

```sh
npm ci
npm run build
npm run check
npm run audit:source
```

这些命令用于本地安装、构建、检查和源码审计，不会主动部署。按实际改动补充必要验证；不要把构建检查通过描述为数据库或真实登录流程已验收。纯文档改动核对内容和链接即可。

修改签到积分的前端状态时，运行 `npm run check:points-races` 验证慢响应、积分并发更新、午夜跨日、身份切换和重复点击；该测试仅使用本地虚拟响应，不调用云服务。

## 云端与数据

- 包内环境ID和域名仍指向原项目。克隆或下载源码不等于获得操作原环境的授权，部署前核对任务授权、目标环境与配置。
- 不把 `.private/`、`.env`、服务端密钥、本机登录凭证、账号/会话数据或用户照片加入提交或日志。
- Git代码与ZIP不是数据库、原图的备份。结构迁移不能代替数据备份，不因更新代码清空照片、账号、评论或历史票数。
- 已有环境按 `docs/DEPLOY.md` 和最新更新说明的功能依赖顺序升级；旧账号/周点赞逻辑更新后核对评论榜函数，商城迁移后最后应用 photo-rarity，避免旧脚本覆盖现行规则。
- 沿用现有 CloudBase 部署方式，HTTP函数部署不增加 `--path`。不同环境需同步核对区域、数据库schema、私有桶、路由、静态域名和环境ID。
- 完成后在说明中列出实际修改、验证结果、部署状态及仍需处理的限制；继续维护 `UPDATE_NOTES.md`，方便下一位协作者或AI接手。

## 桌面卡牌与成就

修改src/mall-card-hover.*时只对宽度>700、hover:hover、pointer:fine、非reduced-motion的鼠标启用，保持单卡/单帧调度和清理；手机卡片尺寸/交互不改。src/mall-collection-*使用服务端完整库存总数，不能按当前分页计数，三个称号按用户原名保留。运行npm run check:collection。本版本不需要SQL迁移。

## 稀有度与新版成就

阅读 photo-rarity.sql、src/mall-api.ts 和最新 UPDATE_NOTES.md。先按82/10/5/3抽类别，再在类内抽照片，空池按剩余权重分配；不能按每张照片赋权造成类别概率随张数变化。保留已生成的当日组。进度使用服务端全部库存；成就门槛20/40/60，不能退回10/20/30。旧photo-mall迁移后必须最后运行photo-rarity迁移。真实分类清单只在私有数据库和忽略目录中，不能提交照片或账号数据。

## 相机开场

阅读src/camera-intro-*和build.cjs。保留后台加载、同标签页会话判断、六片叶片透出真实首页/无空闲循环、减少动态效果仅120ms淡出、原生dialog焦点及失败退出保护。首次须知由showInitialUsageNotice在开场结束后显示，不能恢复旧的立即弹出注入。不要让开场重置账号或原有照片墙状态。修改后运行npm run check:camera，并按需求做手机/主题和进入流程浏览器验收。

开场配置在src/camera-intro-config.json（durationMs/skipSession/sessionKey）。camera-page是构建时静态包裹首页的容器，不能在动画中克隆、替换或重建首页。叶片自然层叠，仅中央开口透出页面；不要恢复旧单闪光效果。

当前造型保持黑白灰圆角相机，叶片与镜头环在camera-iris-renderer.js中绘制，优先Worker，Canvas2D降级。六片弧形叶片循环覆盖，首片返回片段不是第七片；反向画布坐标保持高光注册，连续曲边底层封住接缝，镜头环覆盖外缘。正常模式覆盖层opacity始终1，只有中央开口透明；不要恢复旧嵌套clip-path或放大全屏SVG背景。旋转60度、121个对数关键帧不代表121fps；没有本轮有效呈现帧率测量时不要承诺120fps。

## 保密仓库与集齐成就（2026-10-21）

以AI_HANDOFF.md最新记录为准。修改保密卡阅读photo-vault.sql、photo-vault-visibility.sql、src/photo-vault-api.ts；图片直链/原始文件必须经过鉴权，照片及保密标签同事务写入。保留原service_role对稀有度表的只读权限，用专用函数标签。购买先FOR UPDATE，不能退回共享锁升级。旧已购图按用户指定保留公开状态和收藏，只改等级。collection-sets.sql为持久集齐成就，空卡池不授予，新增照片不收回；四个称号必须逐字保留。最后应用vault、collection-sets、vault-visibility、admin-card-upload迁移，不重初始化。稀有卡反光是用户本轮明确要求，不能引用旧“取消增强”记录恢复旧外观。


## 保密级最终显示规则

此段已被最终私密规则覆盖：保密级不在公开墙/共享相册/计数/榜单展示，包含已购；photo_is_classified用于隐藏，photo_in_vault仅商城未售/独占。最后应用classified-private，不能用旧classified-public覆盖。管理员与实际收藏者/当日提供账号按权限看图。


## 已有照片分级

阅读src/admin-rarity-*和admin-photo-rarity.sql。管理员仅改现有photo_rarities，不能重建照片或清理互动/库存；后台和SQL均验证白名单，先锁照片行。UI当前等级只在展开时读取，防切图/账号切换旧响应，不增加首页逐图请求。保密级按最终规则隐藏。现有环境新增apply-admin-photo-rarity迁移；验证后继续维护同一AI_HANDOFF。


## 统一照片管理

管理员顶栏入口现为“照片管理”，src/photo-manager-*提供12张分页/搜索/等级过滤和上传返回；不恢复为直达上传。GET /admin/photos与分级POST均校验白名单，共用requirePhotoAdmin；写入沿用set_admin_photo_rarity，不重复上传。管理界面不应在首页自动全量加载；关闭清理图片队列，最多3并发，旧请求不能污染新查询或新账号。


## 最终私密与签名修复

以最新AI_HANDOFF为准：保密级仅商城刷新，已购也不公开；评论表情须脱敏，管理员仍可管理。最后运行apply-classified-private。公开相册元数据不得逐图生成签名；src/platform.ts.cachedUrl或受控文件路径延迟读取，签名最多3并发、同key合并与有界重试，不能恢复Promise.all 100签名或清空整张缓存。运行verify-storage-signing及verify-photo-vault-db；线上verify-classified-private-live检查全部页和匿名拒绝。


## 抽卡栏目

修改抽卡先读photo-draw.sql、src/draw-*与最新AI_HANDOFF。每账号30传奇及以上/50保密双保底，用户确认提前出卡重置、跨天保存；不重复入原库存，空池整次回滚。单抽10/十连90，库存十连单张9，保持历史80约束。真实积分/库存不能用于测试；运行verify-photo-draw-db隔离验证。最后应用apply-photo-draw（不可重置旧保底/请求），部署后核对匿名拒绝与资源哈希。保密可商城与抽卡获取，仍不公开。抽卡演出在src/draw-cinema-*：结果先渲染，覆盖层只读取本次结果图片；快门后先进入相机背面屏幕，点击才翻到下一张（十连）或结束（单抽/最后一张），不自动结束。减少动态效果、切号、关闭抽卡或页面隐藏时取消；进入屏幕前有8秒过渡保护。运行npm run check:draw-cinema。不得为动画新增接口或修改概率、积分、库存、保底事务。
