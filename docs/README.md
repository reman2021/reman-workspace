# 文档导航

本目录说明 Reman Workspace 当前实现的架构、开发方式和迁移兼容边界。用户操作从[使用说明](../使用说明_ZH.md)开始。

- [架构说明](架构说明.md)：源码分层、启动与渲染、Markdown 同步、Todo 来源旁路、主题门户与兼容层。
- [开发指南](开发指南.md)：本地环境、构建与样式生成、测试、文档检查、根目录发布产物和标签发布流程。
- [迁移与兼容](迁移与兼容.md)：从 `apex-dashboard` 迁移时保留的视图、状态、设置和 Markdown 契约。
- [主页示例](../examples/dashboard-template.md)：只含 Memo、Todo 的最小起始内容；不要用它覆盖已有主页。

项目定位和安装入口见[中文 README](../README_ZH.md)，英文入口见 [README](../README.md)。

阅读源码时从 `src/main.ts` 进入；开发命令和 `src/`、`tests/`、`scripts/` 的职责见[开发指南](开发指南.md)。
