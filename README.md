# Reman Workspace

Language: English | [简体中文](README_ZH.md)

**Reman Workspace** is a focused personal workspace for Obsidian, derived from [PandoraReads/apex-dashboard](https://github.com/PandoraReads/apex-dashboard). It keeps memos, todos, notes, file access, lightweight databases and optional tracking on one home page without introducing a general workflow engine.

The plugin ID, GitHub repository and recommended local checkout directory are all named `reman-workspace`.

## Core features

- Memo and Todo cards with inline editing, task ordering, reminders, templates, archive and restore.
- Optional monthly and daily source cards that read tasks from existing Vault notes and write checkbox changes back to those source notes.
- Quick actions, recent documents and compact search across Markdown, Bases, Canvas, PDF and supported media.
- Unified note cards with optional covers and linked-document ordering.
- Frontmatter-based database views, numeric trackers and heatmaps.
- An adaptive light/dark appearance, editable quote banner, section folding and responsive desktop/mobile layouts.
- Compatibility reads for legacy workspace views, settings, local state and `notes` sections.

## Quick install

Install dependencies and build the release artifacts with the versions declared by `package.json` and `manifest.json`:

```sh
npm ci
npm run build
```

Copy `main.js`, `styles.css` and `manifest.json` to:

```text
<Vault>/.obsidian/plugins/reman-workspace/
```

Reload Obsidian, enable **Reman Workspace**, then set **Dashboard file** to an existing Vault-relative path without `.md`, such as `Home`. Keep existing `data.json`, dashboard Markdown and historical backup files when upgrading.

## Documentation

Detailed documentation is maintained in Chinese:

- [使用说明](docs/使用说明.md)
- [文档导航](docs/README.md)
- [架构说明](docs/架构说明.md)
- [开发指南](docs/开发指南.md)
- [迁移与兼容](docs/迁移与兼容.md)
- [Starter dashboard](examples/dashboard-template.md)

Licensed under MIT. Original upstream attribution is retained.
