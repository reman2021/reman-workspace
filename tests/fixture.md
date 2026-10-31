---
dashboard: true
banner:
  quote: "Stay focused"
  author: ""
  quoteLibraryPath: "Library/quotes.md"
  quoteColor: "#123456"
  images: ["https://example.com/banner.png", "Assets/banner.png"]
quickActions:
  - name: Learning
    icon: file-text
    type: file
    target: Learning/Learning.md
hiddenPresets: ["p:daily-notes"]
columns:
  - name: Memo
    color: "#f59e0b"
    type: memo
  - name: Todo
    color: "#6366f1"
    type: todo
  - name: Database
    color: "#6366f1"
    type: library
    library:
      filters: [{property: tags, values: [Course]}]
      viewMode: table
      sortBy: modified
      sortDesc: true
  - name: Tracking
    color: "#6366f1"
    type: heatmap
    heatmapLayout: row
    heatmapItems:
      - id: fitness
        key: fitness
        label: Fitness
        days: 30
  - name: Legacy
    color: "#6366f1"
    type: dashboard
---

## Memo

### Ideas
id: memo-1
See [[Learning/Learning.md]]

## Todo

### Current
id: todo-1
type: task
- [ ] Read [[Learning/Learning.md]]
- [x] Finished

### Archived
id: todo-archived
type: task
archived: true
archivedAt: 2026-07-09
- [x] Done

## Database

## Tracking

## Legacy

### Old weather
id: weather-1
type: weather
lat: 31.23
lon: 121.47
city: "南京"
custom: keep this exact field
Keep **all** this text.
