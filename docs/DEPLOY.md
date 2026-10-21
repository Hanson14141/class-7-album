# 构建与 CloudBase 部署

## 1. 安装并构建

在项目根目录运行 npm ci、npm run build、npm run check。无需全局安装 CLI。上传代码后，其他电脑克隆下来也需要执行安装和构建。

## 2. 当前配置

- cloudbaserc.json：当前环境 ID、函数名称、运行时、内存、区域和同源入口。
- build.cjs：当前静态托管域名 staticOrigin，以及备用入口链接。
- src/server.ts：CLASS7_ORIGIN 环境变量决定请求入口；源代码默认值指向当前网站。
- src/platform.ts：使用上海区域、class7_test schema 和 CLASS7_STORAGE_BUCKET 指定的私有桶。

cloudbaserc.example.json 提供不含密钥的结构示例。部署到其他环境时，需要同时核对上述文件以及 scripts/apply-schema.cjs、scripts/setup-storage.cjs 的环境 ID。不要只改网页域名就认为后台已迁移。

## 3. 账号、数据库和存储

由环境所有者使用官方 CloudBase CLI 登录：npx tcb login。

新环境需要 PostgreSQL、私有 class7_test schema、私有存储桶和函数权限。schema.sql 只创建表结构和参数化事务函数，不包含用户数据。scripts/apply-schema.cjs 会修改指定环境数据库，只有确需初始化或维护结构时才手动执行，不是本地构建必需步骤。

scripts/setup-storage.cjs 可为已配置的环境准备私有测试桶和七天服务端密钥，把敏感配置写入 .private/。已有密钥过期时脚本会停止，不会自动续期。执行它会操作云资源，请先确认套餐额度和授权范围。

当前已有环境不要重复初始化，更不要把旧照片归属按昵称批量合并。正式照片和账号数据需要单独备份、迁移。

## 4. 更新已配置的环境

本次账号关联功能新增数据库表和 SQL 函数。升级已有环境时，先在已授权的目标环境执行 `node scripts/apply-account-linking.cjs`，成功后再部署函数。这个步骤只安装结构，不自动关联任何真实账号；实际关联必须由用户在网站验证另一个账号的密码。新建环境的 schema.sql 已包含该结构。


确认 .private/cloudbaserc.json 中包含有效的服务端存储密钥后，在项目根目录运行（将环境 ID 换为你的目标；当前配置值见 cloudbaserc.json）：

```sh
npx tcb hosting deploy hosting -e YOUR_ENV_ID --verify --json
npx tcb fn deploy class7-photo-api --httpFn --force --install-dependency true --deployMode zip --yes --json --config-file .private/cloudbaserc.json
```

服务端密钥只能放在函数环境变量或 .private/ 中，不能写入前端、公开配置或提交 Git。

## 5. 路由与验收

现有入口使用 /api 指向 class7-photo-api 的 WEB_SCF 路由，并传递原路径。首次新建环境时还需在控制台完成静态托管、HTTP 服务路由和函数角色配置；仅上传文件不保证全部后台资源已配置。

函数部署不要增加 --path 参数；当前使用的 CLI 曾因此把 HTTP 路由改成不兼容的类型。静态托管根路径不额外填写 /。

发布后检查页面、登录、上传、下载、自己的照片管理和留言。若浏览器直传的安全域名配置被套餐拒绝，应停止并核对费用，不要为了部署擅自升级或启用超额计费。当前版本使用同源流式上传，不依赖尚未接通的直传草稿。

### 解除关联功能升级

已有环境部署此版本前，重新运行 node scripts/apply-account-linking.cjs 安装 unlink_account 函数；执行结构更新不会解除现有账号关联。解除操作由用户选择目标、查看保留照片数量并验证当前账号密码后提交。当前账号及其余关联账号保留所有现有共享照片/留言，被移除账号不再管理这些内容。

正式发布状态与凭证/套餐延期说明见 [RELEASE.md](RELEASE.md)。


### 点赞功能升级

已有环境先安装私有点赞表和事务函数，再部署：运行 `node scripts/apply-photo-likes.cjs`（需已安装官方 CLI 并登录）。迁移来自 photo-likes.sql，同时更新解除关联时的点赞保留逻辑，不自动改变已有账号关联或照片。全新环境的 schema.sql 已包含点赞结构。点赞记录只保存在 CloudBase，GitHub 源码包不包含点赞或账号数据。后续重装 account-linking.sql 后，应再执行点赞迁移以确保当前函数版本。

### 点赞排行升级

已经安装 photo-likes.sql 的环境无需新的数据库迁移。重新构建并上传静态资源、部署 class7-photo-api 即可。排行榜沿用私有点赞表和现有账号鉴权，排序与游标分页由服务端完成；请同时更新前后端，防止旧后端忽略 sort 参数。

### 每周大赛升级

已有点赞环境先执行 `node scripts/apply-weekly-contest.cjs`，再构建、上传静态资源和部署HTTP函数。脚本限制现有class7-memory环境，以事务安装私有历史/周榜表、触发器与查询函数，并更新点赞和解绑函数。会短暂锁定相关表安装结构，不清空照片、账号或点赞；重复执行不会重置首期开启时间或最早投票时间。迁移应最后执行，确保解绑函数包含历史保留逻辑。全新环境schema.sql已包含全部结构。

没有新增公开数据库表、凭证、收费资源、付费调度或浏览器定时任务。周界线由数据库北京时间计算，读取或写入时自动补结算。自行部署到其他环境时先核对脚本中的环境保护条件。升级时请同时发布前后端，并检查本周、上周、取消/重赞及旧赞排除规则。

### 留言回复、点赞与提醒升级

已有环境先运行 `node scripts/apply-comment-interactions.cjs`，安装私有留言点赞表、回复字段、站内未读状态及解绑时保留点赞的函数，然后构建并同时部署静态文件和云函数。迁移不会清空或改写已有留言；新环境的 `schema.sql` 已包含完整结构。提醒内容只向登录的被回复者返回，公开留言接口不返回登录账号或点赞者名单。无需邮件、微信、额外云函数或付费资源。

### 每周点赞机会重置升级

已有每周大赛环境运行 `node scripts/apply-weekly-vote-reset.cjs`，再构建并发布前后端。脚本在事务内扩展照片点赞为每周一条记录，校验原有点赞及已结算结果保留，安装当前计票和解绑逻辑；执行时会短暂锁表。每周一北京时间00:00可再次给旧照片点赞，总赞累计、本周可取消、历史结算保持。新环境完整 schema.sql 已包含结构；若重装旧版点赞 SQL，应最后重新运行此迁移。当前 apply-weekly-contest.cjs 已自动包含该升级。

### 这期神了与评论每周点赞升级

已有照片周点赞和留言互动环境，最后运行 `node scripts/apply-comment-contest.cjs`，成功后重新构建并发布静态文件与HTTP函数。该脚本在同一事务中扩展评论点赞为“评论、账号、周次”记录，新增私有评论周榜快照，更新关联与解绑函数，并通过指纹校验旧评论及原点赞记录没有变化。结构安装会短暂锁表，不清空账号、照片、留言或历史点赞。新环境的完整 schema.sql 已包含此版本。

各迁移按功能先后执行；若重新运行旧的留言互动、照片周榜或关联账号迁移，务必最后再运行评论榜迁移，以保留最新的周点赞与解绑逻辑。SQL通过 scripts/execute-sql.cjs 的标准输入传给官方CLI，避免Windows命令行长度限制；运行前仍需环境所有者正常登录。没有新增凭证、云函数、调度或付费资源，不自动升级套餐。

发布后检查“这期神了”的本周、上周、总赞榜，确认来源照片可跳转且旧评论可定位；新一期机会重置、当前周取消及账号关联需在隔离测试数据中验证，避免为验收改动真实用户的票数。

### 签到与积分升级

此版本在已安装照片/评论周榜的环境上，执行 `node scripts/apply-checkin-points.cjs`，再构建并发布前后端。迁移仅新增私有积分配置、流水、总分表及签到/事务奖励函数；在事务内校验已有账号、照片、评论与点赞未变。请勿为此重复执行完整 schema.sql。

新的 API 使用 set_photo_like_with_points 与 set_comment_like_with_points 包装已有每周点赞函数，点赞与积分原子保存；评论与奖励同样在现有批处理事务内提交。每周仍可重赞，但同一账号每张照片/评论的奖励终身最多一次。原来的周榜、评论及账号关系沿用，积分本身按登录账号独立，不因照片账号关联而合并。

先安装当前评论周榜等既有迁移，最后再安装签到积分迁移。新环境 schema.sql 已包含两者。服务端凭证和原存储配置继续使用本机私有配置，不从下载的ZIP导入，也不在Git提交中提供。发布后核对签到入口、个人积分、重复签到、北京零点、七天奖励、评论每日50分上限、点赞奖励去重及前后端资产哈希；业务写入验证优先使用隔离测试数据。


### 每日照片商城与库存表情

在现有签到积分环境依次应用尚未安装的 apply-mall.cjs、apply-photo-mall.cjs 和 apply-comment-emoji.cjs，不能重复全量初始化。迁移前后校验已有数据，旧商品记录保留。构建后同时部署静态与HTTP函数，不加--path。当前环境已经完成这些迁移；只改界面不需要重跑。旧mall-goods清单已停用。验证详情与边界见根目录UPDATE_NOTES.md。


### 照片稀有度与收藏进度

已安装每日照片商城的环境最后运行 `node scripts/apply-photo-rarity.cjs`，再构建并部署前后端。若重跑旧photo-mall迁移，必须再应用photo-rarity；不要重初始化真实数据库。photo_rarities由环境所有者维护，示例命令 `node scripts/set-photo-rarity.cjs /absolute/path/to/.private/tiers.json`，格式和验证边界见UPDATE_NOTES.md。源码包不携带线上个人分类清单、照片或账号。成就门槛改为20/40/60张。


### 2026-10-20 掉率和分级定价

再次应用photo-rarity增量，更新普通85/史诗10/传奇5概率及10/20/30积分定价；库存价格约束允许10、20、30，旧记录不变。新API调用五参数buy_mall_photo并验证客户端确认价格；四参数旧接口只提示刷新。最后构建并同步发布静态与HTTP函数。迁移前后仍校验既有照片、账号、票数、积分和库存。


### 2026-10-21 保密仓库、持久集齐成就与管理员卡牌上传

现有环境依次执行 apply-photo-vault.cjs、apply-collection-sets.cjs、apply-photo-vault-visibility.cjs、apply-admin-card-upload.cjs，再构建、部署静态与HTTP函数。不能重跑完整schema初始化；若旧迁移覆盖相关函数，重新应用本节增量。管理员白名单从忽略目录JSON维护，仅环境所有者明确授权后运行set-vault-admins.cjs；不要把实际名单打包。

管理员顶栏“卡牌上传”在现有上传窗口选择史诗/传奇/保密，沿用多选、说明与旋转。POST /admin/photos由后台校验，普通上传不能自选等级。未售保密照片仅管理员和当日获提供的账号可读取；保留原图/原始下载与榜单鉴权。旧已购卡只改等级时不转移历史所有权、不删除收藏。四类集齐成就非空池集齐才解锁，服务端持久保存，新增照片不会收回。


### 保密卡公开修订（2026-10-21较新）

保密级只表示稀有度，照片上传后即公开上墙；3%初始抽取权重、80积分和既有独占购买逻辑保留。最后执行node scripts/apply-classified-public.cjs，再构建并部署；本次仅重定义榜单读取函数，校验既有记录不变。不要恢复上一节的未售隐藏逻辑。新schema已同步。


### 已有照片分级（2026-10-21）

已有环境运行node scripts/apply-admin-photo-rarity.cjs，保留原白名单；新schema已包含。仅新增服务端鉴权函数，不写真实稀有度数据。构建并同步发布前后端后，管理员可在照片大图说明区域“设置卡牌等级”，选择四档等级直接修改。原ID/文件/点赞/评论/收藏/旧成交价保留，保密级依旧公开。


### 统一照片管理（2026-10-21）

本轮无新SQL迁移，依赖上版set_admin_photo_rarity；未安装者先运行apply-admin-photo-rarity.cjs。构建并同步发布静态与HTTP后，管理员顶栏为“照片管理”，支持12张分页、名称/上传者查询、四类过滤、单图改等级以及上传返回。上传仍复用原入口，不迁移照片或改现有归属。


### 最终规则：保密卡仅商城刷新与签名限流修复（2026-10-21）

覆盖此前公开规则：保密级包含已购均不公开上墙/计数/榜单，管理员、当日抽到未售卡的账号、实际收藏者按权限查看；购买后也不公开，不能作公开评论表情。现有环境最后运行node scripts/apply-classified-private.cjs，校验旧数据指纹不变；不要再以旧classified-public覆盖。新schema已同步。签名改为按需读取、3并发/同对象合并/有界重试；列表只用缓存或受控文件路径，不同时签名100张。不移动或压缩原图。部署静态与HTTP后运行verify-classified-private-live和verify-collection-live，运行verify-storage-signing做假网关测试。旧公开临时链接仍受原有效期限制。


### 2026-10-21 保密卡40积分

在已有环境运行node scripts/apply-classified-price.cjs，仅替换购买函数和库存价格约束；保留80积分历史成交记录。构建并同步部署静态和HTTP函数，再运行verify-collection-live核对40积分配置及资源哈希。今日未买卡用新价，旧页面提交80要求刷新。保密隐藏规则与抽取权重不变，不重跑完整schema或旧vault迁移。


### 2026-10-21 抽卡与双保底

在已有环境最后运行node scripts/apply-photo-draw.cjs，再构建并部署静态与HTTP函数；不重跑完整schema。此迁移保留原账号/照片/积分/库存，并新增仅服务端可写的保底与幂等请求表。十连库存记账允许9积分，不恢复旧价格约束。单抽10/十连90，30抽传奇及以上/50抽保密，单抽十连共用跨天计数；提前抽到重置对应计数，空池整次回滚。隔离验证verify-photo-draw-db、只读线上verify-photo-draw-live及verify-collection-live；不要代真实用户抽卡或花费积分。
