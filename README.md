# 导航页

一个纯前端的个人浏览器导航页，可直接部署到 GitHub Pages。

## 使用方式

直接打开 `index.html` 即可使用。为了让公网 IP、位置和测速功能正常工作，建议通过 HTTPS 网站或本地网页服务打开。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库。
2. 将此目录中的全部文件上传到仓库根目录。
3. 打开仓库的 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**，分支选择 `main`，目录选择 `/ (root)`。
5. 保存后等待 GitHub 生成访问地址。

个人分类、网址、背景和搜索设置保存在当前浏览器中，不会上传到 GitHub，也不会自动同步到其他设备。可以在设置中导出配置文件进行备份。

页面默认提供“常用”分类，包括哔哩哔哩、GitHub、ChatGPT、小红书、Gemini 和 X。通过“网站管理”统一添加、编辑、删除和排序分类及网站。

左上角默认显示“日拱一卒，静水流深。”，可以在设置中更改。网站管理中，分类使用上下按钮排序，分类内的网站通过按住拖动手柄排序。

## 默认搜索地址

- Google：`https://www.google.com/search?q={query}`
- 必应中国：`https://cn.bing.com/search?q={query}&ensearch=0`

设置中可以更改两个搜索引擎的名称和搜索网址，图标会根据网址自动更新；搜索关键词占位符 `{query}` 必须保留。
