export function generateDefaultMarkdown(): string {
	return `---
dashboard: true
banner:
  quote: ""
  author: ""
quickActions: []
columns:
  - name: Memo
    color: "#f59e0b"
    type: memo
  - name: Todo
    color: "#6366f1"
    type: todo
---

## Memo

## Todo
`;
}
