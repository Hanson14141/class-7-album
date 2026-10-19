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
- 每日照片商城阅读 photo-mall.sql、src/mall-*；评论库存表情阅读 comment-emoji.sql、src/comment-emoji-* 和评论/榜单接线。价格由数据库按等级固定为10/20/30，货架每账号每天固定五张，扣分和库存需同事务。旧mall-goods已停用，不再作为上架入口。
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

阅读 photo-rarity.sql、src/mall-api.ts 和最新 UPDATE_NOTES.md。先按85/10/5抽类别，再在类内抽照片，空池按剩余权重分配；不能按每张照片赋权造成类别概率随张数变化。保留已生成的当日组。进度使用服务端全部库存；成就门槛20/40/60，不能退回10/20/30。旧photo-mall迁移后必须最后运行photo-rarity迁移。真实分类清单只在私有数据库和忽略目录中，不能提交照片或账号数据。
