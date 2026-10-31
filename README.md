# Reman Workspace · Lean workspace

**Reman Workspace** is a personal Obsidian workspace derived from [PandoraReads/apex-dashboard](https://github.com/PandoraReads/apex-dashboard), version **1.1.5**. It keeps a focused home page and its existing customizations rather than merging upstream 3.x wholesale. The plugin ID and package name are `reman-workspace`; the existing local checkout and repository name do not need to change.

## Features

- Optional **monthly/daily plan source cards** inside Todo: configurable local-date path templates and section scope, source-relative Markdown links, atomic checkbox writeback, external-file refresh and a template-command entry when the note is missing. No source tasks are copied into the dashboard.
- Memos, todos, wikilinks, inline editing, task drag ordering, reminders, task templates, archive and restore.
- A Monday-to-Sunday weekly strip with today highlighted, file and command shortcuts, recent documents, and compact file search. Search matches names and vault-relative paths (case insensitive), displays up to 20 results with paths, and supports arrow keys, Enter, Escape and clicks. Includes Markdown, Bases, Canvas, PDF and supported media; hidden directories are excluded. Mobile search lives in the banner's quick-actions drawer.
- Unified note cards with linked documents and document drag ordering. A non-empty cover path shows the resolved image, an empty path keeps the card coverless, and an unresolved path shows a placeholder.
- Frontmatter-based database filters with grid, list, table and kanban views. Existing Obsidian Bases remain ordinary files you can open from shortcuts or search.
- Optional numeric trackers and heatmaps, retaining their existing data sources and Chart.js charts.
- One adaptive default appearance with no theme selector, plus section folding, custom title, optional startup opening, a quote-library banner, color picker and rotating background images. The appearance follows Obsidian's current light/dark mode and theme colors, using borderless sections, solid cards, light shadows, clear card boundaries and small 2/3/4 px corner radii.
- Up to five home-page backups in `.obsidian/plugins/reman-workspace/backups/`.

Add-action controls stay visible before the pin button. Plugin modals use one native outer surface; textareas stay within the modal width and can only resize vertically.

## Removed

Weather, lunar/almanac, fortune drawing, Pomodoro, reading timers and countdowns, including controls, services and dedicated dependencies. No RSS, AI dispatch, workflow engine, music, accounting or new query engine is introduced.

Legacy settings for removed features are ignored. Legacy weather cards are hidden while their original Markdown is retained when other cards are saved. Historical record files are never deleted. Task reminders and database filters still offer date pickers.

New boards contain only empty Memo and Todo sections. Existing layouts remain supported. Vault notes, templates, Bases and installed plugin files are not changed by this repository update.

## Migration compatibility

Existing `apex-dashboard-view` workspace layouts and `apex-dashboard-*` state keys remain readable. When the new plugin has no current settings yet, it imports the legacy plugin settings; Reman Workspace subsequently writes settings, workspace views and state under the new `reman-workspace` identity. New sections offer one unified **Notes** type; legacy `type: notes` sections are read as that same type without a manual dashboard-file migration.

Legacy `stylePreset` values remain readable but always fall back to the single default appearance at runtime. No manual settings migration is required.

Backups are now written to `.obsidian/plugins/reman-workspace/backups/`. Files under `.obsidian/plugins/apex-dashboard/backups/` are not moved automatically; keep that directory or copy any backups you still need into the new location.

## Build and install

Use **Node.js 22 or newer** for development and **Obsidian 1.8.7 or newer** to run the plugin.

```sh
npm ci
npm run build
npm run lint
npm test
```

Copy the root **main.js**, **styles.css** and **manifest.json** into your vault's `.obsidian/plugins/reman-workspace/` directory, then reload and enable **Reman Workspace**. Preserve the existing `data.json` and historical records. Set Dashboard file to a vault-relative path without `.md`, such as `Home`. Do not replace an existing home page with the starter template.

`npm run test:browser` uses installed Chrome/Edge, or the executable specified by `CHROME_PATH`, to test desktop/mobile layouts, search, Todo interactions and canvas charts. Screenshots go to ignored `.test-output/`. Automated tests use synthetic vault data and an Obsidian API test double; final validation inside the actual Obsidian client remains a manual step.

MIT licensed; original author attribution is retained.
