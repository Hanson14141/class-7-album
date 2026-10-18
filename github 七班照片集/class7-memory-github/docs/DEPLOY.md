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
