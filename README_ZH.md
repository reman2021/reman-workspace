# Reman Workspace

语言：[English](README.md) | 简体中文

**Reman Workspace** 是基于 [PandoraReads/apex-dashboard](https://github.com/PandoraReads/apex-dashboard) 定制的个人 Obsidian 工作台。它以一个主页集中承载备忘录、待办、笔记、文件入口、轻量数据库和可选数据追踪，不引入通用工作流引擎。

插件 ID、GitHub 仓库名与建议本地检出目录均统一为 `reman-workspace`。

## 核心功能

- Memo 与 Todo 卡片：支持就地编辑、任务排序、提醒、模板、归档与恢复。
- 可选的本月／当日来源卡：从现有 Vault 笔记读取任务，并将勾选状态直接写回来源笔记。
- 快捷操作、最近文档与文件搜索：覆盖 Markdown、Bases、Canvas、PDF 和支持的媒体文件。
- 统一笔记卡片：支持可选封面、多个关联文档及顺序调整。
- 基于 frontmatter 的数据库视图、数值追踪器与热力图。
- 自适应明暗外观、可编辑名言横幅、分区折叠及桌面／移动端响应式布局。
- 兼容读取旧工作区视图、设置、本地状态及 `notes` 分区。

## 快速安装

按 `package.json` 与 `manifest.json` 声明的环境版本安装依赖并构建发布产物：

```sh
npm ci
npm run build
```

将 `main.js`、`styles.css`、`manifest.json` 复制到：

```text
<Vault>/.obsidian/plugins/reman-workspace/
```

重新加载 Obsidian 并启用 **Reman Workspace**，再将 **Dashboard file** 设为已有主页的 Vault 相对路径且不带 `.md`，例如 `Home`。升级时保留现有 `data.json`、主页 Markdown 和历史备份。

## 文档

- [使用说明](使用说明_ZH.md)
- [文档导航](docs/README.md)
- [架构说明](docs/架构说明.md)
- [开发指南](docs/开发指南.md)
- [迁移与兼容](docs/迁移与兼容.md)
- [主页示例](examples/dashboard-template.md)

项目采用 MIT 许可证，并保留原上游署名。
