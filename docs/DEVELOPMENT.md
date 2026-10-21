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


## 相机手动快门开场

src/camera-intro.html/.css为矢量相机布局；camera-intro-boot.js在head预判sessionStorage，camera-intro-ui.js处理原生dialog、单次闪光、退出和首次须知顺序。build.cjs负责插入，不直接改生成文件。运行npm run check:camera；手动验收快门、跳过、减少动态效果、主题与手机。只更新前端，但需同步发布静态和HTTP页面，无SQL迁移。

## 镜头穿越入口（当前版本）

取代上面的旧闪光版。完整深灰相机及六片SVG叶片由src/camera-intro.html/.css绘制；camera-intro-ui.js用原生Web Animations组织按压、推进、开叶和真实首页展开。camera-page在构建时包裹原首页；禁止在运行时克隆或重建首页。

- src/camera-intro-config.json：durationMs默认3200（构建允许500–10000）；skipSession默认true，false每次显示；sessionKey变更可重置会话版本。
- 欢迎文字：camera-intro.html的camera-intro-title和camera-intro-hint。
- 本机验证：npm run build、npm run check、npm run check:camera；后者包括会话、配置、减少动态效果、API/存储异常、跳过和清理。
- 预览：新标签页进入；已有会话只刷新不会重播。需要循环调试时暂设skipSession:false，再构建。
- 只改前端但需同步静态和HTTP页面；不需要SQL迁移，不操作用户数据。

当前入口优化：六片叶片整组旋转45度并退开；HTML图层负责transform/opacity合成，SVG仅为静态绘图。去掉SVG mask和整张长页面缩放，改为首页intro小范围展开。所有动画共享startTime；不要改回SVG g实时缩放或给整张照片墙will-change。叶片局部绘制倍率为4（656px缩至164px），调整几何时须同步rotor尺寸、.25比例和位移倍率。

## 参考图相机与循环层叠（当前）

机身按用户参考图改为中性黑白灰圆角块面。camera-blade-axis为六个约80度的弧形覆盖区域；camera-blade-return把首片的一部分返回第六片上方，形成循环前后关系，不能算作第七片。camera-iris-edge反向位移抵消开口面移动，保持金属薄边与静态弧形边缘对齐。所有clip-path均为静态；实际动画仍为HTML transform/opacity。

旋转60度、对数推进与开口曲线共享时间轴，121个一次生成的关键帧是插值精度，不是帧率；不要恢复平面扇区、星形开口或逐帧JS改路径。配置仍在camera-intro-config.json；改后构建并同步部署静态与HTTP函数。
