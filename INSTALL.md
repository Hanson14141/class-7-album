# 安装与更新 · 2026-10-30

这是照片集和游戏的源码包，不是双击安装的 EXE。下载后先解压；不需要原开发电脑的 cloudbase-tools 文件夹。

## 安装

安装 Node.js 20.19 或更高版本，在本文件所在目录打开终端：

```sh
npm ci
npm run build
npm run check
npm run audit:source
npm run check:camera
npm run check:draw-cinema
```

构建不会登录、部署、执行 SQL 或改变线上数据。生成的 public、hosting 和函数构建文件不需提交 Git。游戏本地静态预览可运行 `npx --yes http-server public -p 4188` 后打开 http://127.0.0.1:4188/game/index.html；该命令会下载临时预览工具，照片集后台仍需 CloudBase。独立中继本地运行：进入 src/dungeon-service，执行 npm ci 和 npm start，监听9000端口。

## 当前版本包含什么

- 照片集全部现有功能、手机库存表情排版修复。
- 同站暗黑地牢入口、原 v0.85.0 引擎、38个游戏素材（含两段音乐）、Socket.IO 客户端和独立服务器。
- 房客移动、待机、道具、准备和同步版本守卫；管理员电脑关机不影响现有云中继。
- 公开环境配置仍指向站主当前服务，下载源码不获得该环境的管理权限。

## 更新网站

GitHub 上传不会自动更新网页。本版已在线部署；单纯上传本包无需再次迁移数据库。授权维护者修改后按 docs/DEPLOY.md 同步静态 hosting 与 HTTP 函数；游戏素材只放静态托管，函数中不重复打包。修改独立中继才需要重新发布 src/dungeon-service。

迁往自己的云环境时，核对 cloudbaserc.json、build.cjs 的静态域名、scripts/build-dungeon.cjs 的 mediaOrigin、src/dungeon-config.json 的服务器地址、服务端 GAME_ORIGINS 和私有凭证。不能只改一个域名。云资源操作均需环境所有者授权；不要重跑积分补偿、照片回收、初始化或旧迁移脚本。

联机是房主裁判、内存双人房间，断线/实例重启需重开，不接网站账号或正式积分，最大一个实例，不能无共享房间状态直接横向扩容。

## 上传 GitHub

推荐 GitHub Desktop：克隆现有仓库，将此包内文件放到仓库根目录，检查变更后提交并推送。不要删除远程 .git 或强制覆盖历史。网页上传需分批（文件较多），上传解压后的源码；ZIP 可以作为 Release 附件。包含隐藏的 .gitignore/.gitattributes。本包不含 .git，原开发 Git 历史仍保留。

## 给接手的 AI

先读 AGENTS.md → AI_HANDOFF.md 最新记录 → UPDATE_NOTES.md → docs/DUNGEON.md。以后继续维护同一个 AI_HANDOFF.md。src/ 与 baseline/ 是修改入口；不要只改自动生成目录。本包包含游戏人物卡牌与音乐素材，不含云端相册原图、账号数据或服务端密钥；GitHub 不替代原图和数据库备份。
