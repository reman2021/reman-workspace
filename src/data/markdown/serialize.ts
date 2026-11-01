import type { DashboardData } from '../../core/types';

export function serialize(data: DashboardData): string {
	const lines: string[] = [];

	lines.push('---');
	lines.push('dashboard: true');

	lines.push('banner:');
	lines.push(`  quote: "${escapeYamlString(data.banner.quote)}"`);
	lines.push(`  author: "${escapeYamlString(data.banner.author)}"`);
	if (data.banner.image) {
		lines.push(`  image: "${data.banner.image}"`);
	}
	if (data.banner.quoteColor) {
		lines.push(`  quoteColor: "${data.banner.quoteColor}"`);
	}
	if (data.banner.quoteLibraryPath) {
		lines.push(`  quoteLibraryPath: "${escapeYamlString(data.banner.quoteLibraryPath)}"`);
	}
	if (data.banner.quotes && data.banner.quotes.length > 0) {
		lines.push('  quotes:');
		for (const q of data.banner.quotes) {
			lines.push(`    - quote: "${escapeYamlString(q.quote)}"`);
			lines.push(`      author: "${escapeYamlString(q.author)}"`);
		}
	}
	if (data.banner.images && data.banner.images.length > 0) {
		lines.push('  images:');
		for (const img of data.banner.images) {
			lines.push(`    - "${escapeYamlString(img)}"`);
		}
	}

	if (data.quickActions.length > 0) {
		lines.push('quickActions:');
		for (const action of data.quickActions) {
			lines.push(`  - name: "${escapeYamlString(action.name)}"`);
			lines.push(`    icon: "${escapeYamlString(action.icon)}"`);
			lines.push(`    type: ${action.type}`);
			lines.push(`    target: "${escapeYamlString(action.target)}"`);
		}
	}

	if (data.quickActionOrder && data.quickActionOrder.length > 0) {
		lines.push('quickActionOrder:');
		for (const key of data.quickActionOrder) {
			lines.push(`  - "${escapeYamlString(key)}"`);
		}
	}

	if (data.hiddenPresets && data.hiddenPresets.length > 0) {
		lines.push('hiddenPresets:');
		for (const key of data.hiddenPresets) {
			lines.push(`  - "${escapeYamlString(key)}"`);
		}
	}

	lines.push('columns:');
	for (const col of data.columns) {
		lines.push(`  - name: ${col.name}`);
		lines.push(`    color: "${col.color}"`);
		if (col.sectionType) {
			lines.push(`    type: ${col.sectionType}`);
		}
		if (col.todoSources) {
			lines.push('    todoSources:');
			for (const kind of ['monthly', 'daily'] as const) {
				const source = col.todoSources[kind];
				lines.push(`      ${kind}:`, `        enabled: ${source.enabled}`);
				for (const key of ['pathTemplate', 'heading', 'createCommandId'] as const) lines.push(`        ${key}: "${escapeYamlString(source[key])}"`);
			}
		}
		if (col.sectionType === 'heatmap') {
			lines.push(`    heatmapLayout: ${col.heatmapLayout ?? 'column'}`);
			if (col.heatmapItems && col.heatmapItems.length > 0) {
				lines.push('    heatmapItems:');
				for (const item of col.heatmapItems) {
					lines.push(`      - id: "${escapeYamlString(item.id)}"`);
					lines.push(`        key: "${escapeYamlString(item.key)}"`);
					lines.push(`        label: "${escapeYamlString(item.label)}"`);
					lines.push(`        days: ${item.days}`);
					if (item.color) lines.push(`        color: "${escapeYamlString(item.color)}"`);
				}
			}
		}
		if (col.libraryConfig) {
			lines.push('    library:');
			const lc = col.libraryConfig;
			lines.push(`      viewMode: ${lc.viewMode}`);
			lines.push(`      sortBy: "${lc.sortBy}"`);
			lines.push(`      sortDesc: ${lc.sortDesc}`);
			if (lc.kanbanGroupBy) {
				lines.push(`      kanbanGroupBy: "${escapeYamlString(lc.kanbanGroupBy)}"`);
			}
			if (lc.pageSize) {
				lines.push(`      pageSize: ${lc.pageSize}`);
			}
				if (lc.quickDateFilter) {
					lines.push(`      quickDateFilter:`);
					lines.push(`        property: "${lc.quickDateFilter.property}"`);
					lines.push(`        start: "${lc.quickDateFilter.start}"`);
					lines.push(`        end: "${lc.quickDateFilter.end}"`);
				}
			if (lc.filters.length > 0) {
				lines.push('      filters:');
				for (const filter of lc.filters) {
					lines.push(`        - property: "${escapeYamlString(filter.property)}"`);
					if (filter.values.length > 0) {
						lines.push(`          values: [${filter.values.map(v => `"${escapeYamlString(v)}"`).join(', ')}]`);
					} else {
						lines.push('          values: []');
					}
					if (filter.dateRange) {
						if (filter.dateRange.start) lines.push(`          dateStart: "${filter.dateRange.start}"`);
						if (filter.dateRange.end) lines.push(`          dateEnd: "${filter.dateRange.end}"`);
					}
				}
			}
		}
	}

	lines.push('---');
	lines.push('');

	for (const column of data.columns) {
		lines.push(`## ${column.name}`);
		lines.push('');



		for (const card of column.cards) {
			if (card.type === 'weather' && card.legacyMarkdown) {
				lines.push(card.legacyMarkdown, '');
				continue;
			}
			lines.push(`### ${card.title}`);

			if (card.id) {
				lines.push(`id: ${card.id}`);
			}

			if (card.type === 'task') {
				lines.push(`type: task`);
			}

			if (card.type === 'project' || card.type === 'tracker') {
				lines.push(`type: ${card.type}`);
			}

			if (card.wikiLink) {
				lines.push(`link: [[${card.wikiLink}]]`);
			} else if (card.url) {
				lines.push(`link: ${card.url}`);
			}

			if (card.progress >= 0 && card.type === 'project') {
				lines.push(`progress: ${card.progress}%`);
			}

			if (card.dueDate) {
				lines.push(`due: ${card.dueDate}`);
			}

			if (card.streak > 0 && card.type === 'habit') {
				lines.push(`streak: ${card.streak}`);
			}

			if (card.color) {
				lines.push(`color: ${card.color}`);
			}

			if (card.coverImage) {
				lines.push(`cover: ${card.coverImage}`);
			}

			if (card.archived) {
				lines.push('archived: true');
				if (card.archivedAt) {
					lines.push(`archivedAt: ${card.archivedAt}`);
				}
			}

			if (card.width > 0) {
				lines.push(`width: ${card.width}`);
			}
			if (card.size && card.size !== 'M') {
				lines.push(`size: ${card.size}`);
			}
			if (card.gridCols > 0) {
				lines.push(`cols: ${card.gridCols}`);
			}
			if (card.gridRows > 0) {
				lines.push(`rows: ${card.gridRows}`);
			}
			if (card.gridCol > 0) {
				lines.push(`gcol: ${card.gridCol}`);
			}
			if (card.gridRow > 0) {
				lines.push(`grow: ${card.gridRow}`);
			}
		if (card.weatherConfig) {
			const wc = card.weatherConfig;
			lines.push(`lat: ${wc.latitude}`);
			lines.push(`lon: ${wc.longitude}`);
			lines.push(`city: "${escapeYamlString(wc.cityName)}"`);
		}

		if (card.trackerConfig) {
			const tc = card.trackerConfig;
			lines.push(`track: ${tc.key}`);
			lines.push(`days: ${tc.days}`);
			lines.push(`style: ${tc.style}`);
		}

			if (card.blockquote) {
				lines.push(`> ${card.blockquote}`);
			}

			if (card.tasks.length > 0) {
				for (const task of card.tasks) {
					let taskLine = `- [${task.checked ? 'x' : ' '}] ${task.text}`;
					if (task.reminder) taskLine += ` ⏰ ${task.reminder}`;
					lines.push(taskLine);
				}
			}

			const bodyLines = card.body.trim();
			if (bodyLines) {
				if (card.tasks.length > 0 || card.blockquote || card.url || card.wikiLink) {
					lines.push('');
				}
				lines.push(bodyLines);
			}

			lines.push('');
		}
	}

	return lines.join('\n');
}


function escapeYamlString(str: string): string {
	return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
