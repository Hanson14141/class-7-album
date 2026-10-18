# 上传到 GitHub

## 最简单：网页上传

1. 解压“高三七班照片集-GitHub上传包.zip”。
2. 在 GitHub 创建空仓库，名称可填 class7-memory；可按需要设为私有。
3. 进入仓库的文件上传页面，把解压出的 class7-memory-github 文件夹**里面的内容**拖进去。README.md 应在仓库根目录，不要再套一层文件夹。
4. .gitignore 和 .gitattributes 也要一起上传；Windows 如未显示，请开启显示隐藏项目。
5. 填写本次修改说明并提交。

不要只把 ZIP 文件上传到仓库，否则 GitHub 只会把它当作一个附件，不会展开成源码。

## 用 Git 推送

本机 class7-memory-github 文件夹已初始化为干净 Git 仓库。进入该目录后，替换下面的用户名和仓库地址：

```sh
git remote add origin https://github.com/YOUR_USERNAME/class7-memory.git
git push -u origin main
```

网页下载的 ZIP 不含 .git；若使用解压后的副本，请先运行 git init、git add .、git commit，再连接远程仓库。可使用 GitHub Desktop 导入本机已初始化的目录来推送。

## 后续更新

修改源码后运行 npm run build 和 npm run check，再提交源码。public/、hosting/ 和函数构建文件会自动生成，不必反复上传。

这个交付包使用新的干净源码提交，方便首次上传。原开发目录和完整 Git 历史保留在本机，未删除或重写；历史 bundle 不放入上传包。

GitHub 仓库不会自动部署到 CloudBase。本包没有自动部署工作流，也未替你创建或公开 GitHub 仓库。
