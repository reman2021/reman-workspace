import type { App } from 'obsidian';
import type { CardSize, DashboardCard, DashboardSettings, TrackerDataPoint, TrackerStyle } from '../../core/types';
import { t } from '../../core/i18n';
import { getDashboardCssColor } from '../../ui/css-color';
import { readTrackerData } from './service';
import { Chart, LineController, LineElement, PointElement, BarController, BarElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, LinearScale, CategoryScale, Filler, Tooltip);

const chartInstances = new Map<string, Chart>();

function destroyChart(cardId: string): void {
	const chart = chartInstances.get(cardId);
	if (chart) {
		chart.destroy();
		chartInstances.delete(cardId);
	}
}

export function destroyAllTrackerCharts(): void {
	for (const chart of chartInstances.values()) chart.destroy();
	chartInstances.clear();
}

export function destroyTrackerChartsIn(container: HTMLElement): void {
	for (const card of Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]'))) {
		if (card.dataset.cardId) destroyChart(card.dataset.cardId);
	}
}

export function renderTrackerBody(container: HTMLElement, card: DashboardCard, app: App, settings?: DashboardSettings): void {
	if (!card.trackerConfig) return;

	const config = card.trackerConfig;
		const size: CardSize = card.size || 'M';
	const style: TrackerStyle = config.style || 'line';
	destroyChart(card.id);

	const el = container.createDiv({ cls: `dashboard-tracker dashboard-tracker--${size}` });

	const data = readTrackerData(app, '', config.key, config.days);
	const validPoints = data.filter(p => p.value !== null);

	if (validPoints.length === 0) {
		el.createDiv({ cls: 'dashboard-tracker-empty', text: t('tracker.noData') + ': ' + config.key });
		return;
	}

	const values = data.map(p => p.value);
	const minVal = Math.min(...values.filter((v): v is number => v !== null));
	const maxVal = Math.max(...values.filter((v): v is number => v !== null));
	const sum = validPoints.reduce((s, p) => s + p.value!, 0);
	const avg = (sum / validPoints.length).toFixed(1);
	const latest = validPoints[validPoints.length - 1]!.value as number;
	const prev = validPoints.length > 1 ? validPoints[validPoints.length - 2]!.value as number : latest;
	const trendDir = latest > prev ? 'up' : latest < prev ? 'down' : 'flat';
	const trendPct = prev !== 0 ? ((latest - prev) / Math.abs(prev) * 100).toFixed(1) : '0';

	// Streak: consecutive days with data (from latest backward)
	let streak = 0;
	for (let i = validPoints.length - 1; i >= 0; i--) {
		if (validPoints[i]!.value !== null) streak++;
		else break;
	}

	if (size === 'S') {
		const row = el.createDiv({ cls: 'dashboard-tracker-compact' });
		row.createDiv({ cls: 'dashboard-tracker-compact-value', text: String(latest) });
		const arrow = row.createDiv({ cls: `dashboard-tracker-trend dashboard-tracker-trend--${trendDir}` });
		arrow.setText(trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→');
		if (config.key) {
			row.createDiv({ cls: 'dashboard-tracker-compact-label', text: config.key });
		}
		return;
	}

	const accentColor = getDashboardCssColor('--db-accent') || '#6366f1';

	// Dispatch by style
	if (style === 'heatmap') {
		renderTrackerHeatmap(el, data, minVal, maxVal, size, accentColor);
	} else if (style === 'bar') {
		renderTrackerBarChart(el, data, size, accentColor, card.id);
	} else {
		renderTrackerLineChart(el, data, size, accentColor, card.id);
	}

	// Stats
	const stats = el.createDiv({ cls: 'dashboard-tracker-stats' });
	const addStat = (label: string, value: string | number) => {
		const stat = stats.createDiv({ cls: 'dashboard-tracker-stat' });
		stat.createSpan({ cls: 'dashboard-tracker-stat-label', text: label });
		stat.createSpan({ cls: 'dashboard-tracker-stat-value', text: String(value) });
	};
	addStat(t('tracker.current'), latest);
	addStat(t('tracker.avg'), avg);

	if (size === 'M') {
		addStat(t('tracker.trend'), `${trendDir === 'up' ? '+' : ''}${trendPct}%`);
	}

	if (size === 'L') {
		addStat(t('tracker.trend'), `${trendDir === 'up' ? '+' : ''}${trendPct}%`);
		addStat(t('tracker.streak'), `${streak}d`);
		addStat(t('tracker.min'), minVal);
		addStat(t('tracker.max'), maxVal);
	}
}

function renderTrackerLineChart(el: HTMLElement, data: TrackerDataPoint[], size: CardSize, accentColor: string, cardId: string): void {
	const chartWrap = el.createDiv({ cls: 'dashboard-tracker-chart' });
	const canvasEl = chartWrap.createEl('canvas', { cls: 'dashboard-chart-canvas' });
	const ctx = canvasEl.getContext('2d');
	if (!ctx) return;

	const chart = new Chart(ctx, {
		type: 'line',
		data: {
			labels: data.map(p => p.date.slice(5)),
			datasets: [{
				data: data.map(p => p.value),
				borderColor: accentColor,
				backgroundColor: `${accentColor}22`,
				fill: true,
				tension: 0.4,
				pointRadius: size === 'L' ? 3 : 0,
				pointHoverRadius: 5,
				pointBackgroundColor: accentColor,
				borderWidth: 2,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { display: false }, tooltip: { enabled: true } },
			scales: {
				x: { display: false },
				y: { display: false },
			},
			animation: { duration: 600 },
		},
	});
	chartInstances.set(cardId, chart);
}

function renderTrackerBarChart(el: HTMLElement, data: TrackerDataPoint[], size: CardSize, accentColor: string, cardId: string): void {
	const chartWrap = el.createDiv({ cls: 'dashboard-tracker-chart' });
	const canvasEl = chartWrap.createEl('canvas', { cls: 'dashboard-chart-canvas' });
	const ctx = canvasEl.getContext('2d');
	if (!ctx) return;

	const textColor = getDashboardCssColor('--db-text-muted') || '#888';
	const validVals = data.filter(p => p.value !== null).map(p => p.value!);
	const barMax = validVals.length > 0 ? Math.max(...validVals) : 1;

	const chart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: data.map(p => p.date.slice(5)),
			datasets: [{
				data: data.map(p => p.value ?? 0),
				backgroundColor: data.map(p => {
					if (p.value === null) return 'transparent';
					const intensity = barMax > 0 ? p.value / barMax : 0;
					return `${accentColor}${Math.round(40 + intensity * 180).toString(16).padStart(2, '0')}`;
				}),
				borderRadius: 2,
				barPercentage: 0.8,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { display: false }, tooltip: { enabled: true } },
			scales: {
				x: { display: false },
				y: { display: size === 'L', grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } },
			},
			animation: { duration: 600 },
		},
	});
	chartInstances.set(cardId, chart);
}

function renderTrackerHeatmap(el: HTMLElement, data: TrackerDataPoint[], minVal: number, maxVal: number, size: CardSize, accentColor: string): void {
	const heatmap = el.createDiv({ cls: 'dashboard-tracker-heatmap' });

	const range = maxVal - minVal || 1;
	const cellSize = size === 'M' ? 10 : 14;
	const gap = 2;

	// Organize data into weeks (columns), days are rows (Mon-Sun)
	// Each column = 1 week, from oldest to newest
	const firstDate = data[0] ? new Date(data[0].date + 'T00:00:00') : new Date();
	const startDayOfWeek = firstDate.getDay(); // 0=Sun, 1=Mon...
	const mondayOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // days from Monday

	// Build week columns
	const weeks: (TrackerDataPoint | null)[][] = [];
	let currentWeek: (TrackerDataPoint | null)[] = [];

	// Pad first week with nulls to align to Monday
	for (let i = 0; i < mondayOffset; i++) {
		currentWeek.push(null);
	}

	for (const point of data) {
		currentWeek.push(point);
		if (currentWeek.length === 7) {
			weeks.push(currentWeek);
			currentWeek = [];
		}
	}
	if (currentWeek.length > 0) {
		weeks.push(currentWeek);
	}

	// Limit visible weeks based on size
	const maxWeeks = size === 'M' ? 15 : size === 'L' ? 26 : 52;
	const visibleWeeks = weeks.slice(-maxWeeks);

	const grid = heatmap.createDiv({ cls: 'dashboard-tracker-heatmap-grid' });
	grid.setCssProps({ 'display': 'grid' });
	grid.setCssProps({ 'grid-template-columns': `repeat(${visibleWeeks.length}, ${cellSize}px)` });
	grid.setCssProps({ 'grid-template-rows': `repeat(7, ${cellSize}px)` });
	grid.setCssProps({ 'gap': `${gap}px` });

	// Day labels (Mon, Tue, ... Sun) for L size
	if (size === 'L') {
		const labels = heatmap.createDiv({ cls: 'dashboard-tracker-heatmap-labels' });
		const dayNames = ['M', '', 'W', '', 'F', '', 'S'];
		for (const name of dayNames) {
			labels.createDiv({ cls: 'dashboard-tracker-heatmap-day-label', text: name });
		}
	}

	for (const week of visibleWeeks) {
		for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
			const point = week[dayIdx] ?? null;
			const cell = grid.createDiv({ cls: 'dashboard-tracker-heatmap-cell' });
			cell.setCssProps({ 'width': `${cellSize}px` });
			cell.setCssProps({ 'height': `${cellSize}px` });
			cell.setCssProps({ 'border-radius': `${Math.max(2, cellSize / 4)}px` });

			if (point === null || point.value === null) {
				cell.addClass('dashboard-tracker-heatmap-cell--empty');
			} else {
				const intensity = (point.value - minVal) / range;
				const alpha = 0.15 + intensity * 0.85;
				cell.setCssProps({ 'background-color': accentColor });
				cell.setCssProps({ 'opacity': String(alpha) });
				cell.title = `${point.date}: ${point.value}`;
			}
		}
	}
}
