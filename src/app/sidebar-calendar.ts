import { getLanguage } from '../core/i18n';

export function renderSidebarWeekCalendar(container: HTMLElement): void {
	const now = new Date();
	const today = now.getDay();
	const mondayOffset = today === 0 ? -6 : 1 - today;
	const monday = new Date(now);
	monday.setDate(now.getDate() + mondayOffset);

	const lang = getLanguage() === 'zh' ? 'zh-CN' : 'en';
	const row = container.createDiv({ cls: 'dashboard-sidebar-week-calendar' });

	for (let i = 0; i < 7; i++) {
		const d = new Date(monday);
		d.setDate(monday.getDate() + i);
		const isToday = d.toDateString() === now.toDateString();

		const cell = row.createDiv({
			cls: 'dashboard-sidebar-week-cell' + (isToday ? ' dashboard-sidebar-week-cell--today' : ''),
		});
		cell.createDiv({
			cls: 'dashboard-sidebar-week-day',
			text: d.toLocaleDateString(lang, { weekday: 'narrow' }),
		});
		cell.createDiv({
			cls: 'dashboard-sidebar-week-date',
			text: String(d.getDate()),
		});
	}
}
