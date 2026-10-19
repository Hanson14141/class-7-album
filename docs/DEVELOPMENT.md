# 代码结构

| 路径 | 用途 |
| --- | --- |
| baseline/public/ | 原界面输入：HTML、照片墙脚本、样式和字体 |
| baseline/lib/ | 原账号与相册 API 输入 |
| build.cjs | 应用 CloudBase 适配、插入新功能并生成发布文件 |
| src/server.ts | HTTP 入口，提供 /api/ 页面与后台请求 |
| src/platform.ts | PostgreSQL 参数化查询和私有图片存储适配 |
| src/photo-compression.js | 超过 12 MB 的静态图压缩至 6 MB 以内 |
| src/upload-compression-ui.js | 上传窗口中的压缩开关及大小提示 |
| src/wall-speed-ui.js | 流速选择与本地记忆 |
| src/account-recovery-ui.js | 登录账号记忆和请求状态控制变量 |
| src/usage-notice.html | 首次访问的简短说明 |
| src/comment-contest-* | 评论榜接口、界面、每周点赞状态与来源照片定位 |
| comment-contest.sql | 评论每周点赞、周榜结算与总赞排序 |
| src/checkin-points-* | 签到/积分接口、状态同步与顶栏展示 |
| checkin-points.sql | 私有积分配置、流水、连续签到与事务点赞奖励 |
| mall-goods/ | 已停用的旧商品目录，仅保留历史兼容，不作为当前上架入口 |
| src/mall-* | 积分商城接口、界面与兑换交互 |
| mall.sql / photo-mall.sql / photo-rarity.sql | 旧商品兼容、每日照片商城及当前85/10/5概率和10/20/30积分定价；最新规则以photo-rarity为准 |
| schema.sql | 数据表、索引和服务端事务函数 |
| functions/class7-photo-api/ | 函数依赖清单及 Linux 启动脚本 |

build.cjs 会生成 public/、hosting/、functions/class7-photo-api/index.cjs、函数 public/，以及 src/accounts.ts、src/photo-api.ts。这些文件已忽略，不直接修改它们；重新构建会覆盖。

改基础界面时编辑 baseline/public/；改 CloudBase 适配时编辑 build.cjs 或 src/。原站快照和本机原开发仓库仍单独保留。下载或修改源码不会自动更新网站，须按部署文档另行部署。

照片、评论和账号存放于云端，不在此源码包里。Git 历史是代码备份，不能代替数据库和原图备份。


## 每日照片与库存表情

photo-mall.sql提供每日货架/十积分购买/库存；src/mall-*负责按需浏览。comment-emoji.sql及src/comment-emoji-*提供评论附件；src/comment-interactions-api.ts在插入事务中校验私人库存归属并奖励积分，评论区/回复/评论榜兼容。旧mall-goods已停用。完整数据库和浏览器验证脚本保留在开发工作目录，源码包附构建检查和积分UI回归。


后续 AI 开始前读取根目录 AI_HANDOFF.md，结束或中断前继续更新该文件的当前状态和接手记录；不以聊天答复替代文件维护。
