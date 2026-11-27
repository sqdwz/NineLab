# 部署

## 本地

```powershell
npm ci
npm run build
npm run preview
```

使用终端打印的 localhost 地址。实体 iPhone 测试使用 HTTPS，普通的 HTTP 局域网地址通常不能提供 Web Bluetooth 的安全上下文。

## GitHub Pages

把 NineLab 作为独立仓库根目录。Settings → Pages → Build and deployment → Source 选 GitHub Actions。分支为 `main` 时，推送会触发项目里的 Pages 工作流；也可通过 workflow_dispatch 手动启动。工作流运行单测、编译并发布 `dist/`。Vite 使用相对资源路径，适用于仓库子路径部署。

[GitHub Pages 发布源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [Vite 静态部署](https://vite.dev/guide/static-deploy.html)

## Cloudflare Pages

- Git 集成使用 build command `npm run build`，输出目录 `dist`，设置构建 Node.js 版本为 22 或 24。
- 也可在 Pages 创建 Direct Upload 项目后上传已构建的 `dist/`，或使用本次交付的静态包。应用不需要 Pages Functions、绑定或环境密钥。

[Cloudflare Pages + Vue](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vue-site/) · [Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## Web 应用与离线

首次访问时 Service Worker 缓存页面和本次构建的静态资源。新版缓存就绪后会接管浏览器内的页面并清理同站点的旧缓存。已打开页面可刷新以载入新版。浏览器优先使用自己的服务工作线程实现。页面缓存、本地数据和备份分别保存，同一地址在不同浏览器中有独立存储空间。
