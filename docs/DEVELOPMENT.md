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
| schema.sql | 数据表、索引和服务端事务函数 |
| functions/class7-photo-api/ | 函数依赖清单及 Linux 启动脚本 |

build.cjs 会生成 public/、hosting/、functions/class7-photo-api/index.cjs、函数 public/，以及 src/accounts.ts、src/photo-api.ts。这些文件已忽略，不直接修改它们；重新构建会覆盖。

改基础界面时编辑 baseline/public/；改 CloudBase 适配时编辑 build.cjs 或 src/。原站快照和本机原开发仓库仍单独保留。本交付不修改正在运行的网站。

照片、评论和账号存放于云端，不在此源码包里。Git 历史是代码备份，不能代替数据库和原图备份。
