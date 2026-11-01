import { formatValue } from '../../utils/value';
import { t, getLanguage } from '../../core/i18n';
import { inheritDashboardThemeVars } from '../../ui/theme';

export const popupCleanups = new Set<() => void>();
export function destroyLibraryPopups(): void {
	for (const cleanup of [...popupCleanups]) cleanup();
	closeCalendarPopup();
}
let calendarCleanup: (() => void) | null = null;
let activeCalendarPopup: HTMLElement | null = null;

function closeCalendarPopup(): void {
	calendarCleanup?.(); calendarCleanup = null;
	if (activeCalendarPopup) {
		activeCalendarPopup.remove();
		activeCalendarPopup = null;
	}
}

export function showCalendarPopup(anchor: HTMLElement, initialValue: string, onSelect: (date: string) => void): void {
	closeCalendarPopup();

		const popup = document.body.createDiv({ cls: 'dashboard-task-reminder-popup dashboard-library-calendar-popup' });

	inheritDashboardThemeVars(popup, anchor);

	popup.setCssProps({ 'background': 'var(--db-bg-card, rgba(255, 255, 255, 0.06))' });
	popup.setCssProps({ 'backdrop-filter': 'blur(16px)' });
	popup.setCssProps({ 'color': 'var(--db-text, var(--text-normal))' });
	popup.setCssProps({ 'border-color': 'var(--db-border-card, rgba(255,255,255,0.1))' });

	const rect = anchor.getBoundingClientRect();
	popup.setCssProps({ 'position': 'fixed' });
	popup.setCssProps({ 'top': `${rect.bottom + 4}px` });
	const popupWidth = 240;
	if (rect.left + popupWidth > window.innerWidth) {
		popup.setCssProps({ 'right': `${window.innerWidth - rect.right}px` });
	} else {
		popup.setCssProps({ 'left': `${rect.left}px` });
	}

	let selectedYear: number;
	let selectedMonth: number;
	let selectedDay: number;

	const now = new Date();
	if (initialValue) {
		const dp = initialValue.split('-').map(Number);
		selectedYear = dp[0] ?? now.getFullYear();
		selectedMonth = (dp[1] ?? now.getMonth() + 1) - 1;
		selectedDay = dp[2] ?? now.getDate();
	} else {
		selectedYear = now.getFullYear();
		selectedMonth = now.getMonth();
		selectedDay = now.getDate();
	}

	const viewYear = { value: selectedYear };
	const viewMonth = { value: selectedMonth };
	const lang = getLanguage();
	const dayNames = lang === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

	const calNav = popup.createDiv({ cls: 'dashboard-task-reminder-calendar-nav' });
	const prevBtn = calNav.createEl('button', { text: '<' });
	const monthLabel = calNav.createEl('span');
	const nextBtn = calNav.createEl('button', { text: '>' });

	const calGrid = popup.createDiv({ cls: 'dashboard-task-reminder-calendar' });

	const btnRow = popup.createDiv({ cls: 'dashboard-task-reminder-popup-btns' });
	btnRow.createEl('button', { cls: 'mod-cta', text: t('common.save') });
	btnRow.createEl('button', { text: t('common.cancel') });

	const renderCalendar = () => {
		calGrid.empty();
		const y = viewYear.value;
		const m = viewMonth.value;
		monthLabel.setText(`${y}-${formatValue(m + 1).padStart(2, '0')}`);

		for (const d of dayNames) {
			calGrid.createDiv({ cls: 'dashboard-task-reminder-calendar-header', text: d });
		}

		const firstDay = new Date(y, m, 1).getDay();
		const daysInMonth = new Date(y, m + 1, 0).getDate();
		const daysInPrev = new Date(y, m, 0).getDate();
		const today = new Date();
		const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;

		for (let i = firstDay - 1; i >= 0; i--) {
			const d = daysInPrev - i;
			calGrid.createEl('button', { cls: 'dashboard-task-reminder-calendar-day dashboard-task-reminder-calendar-day--other-month', text: formatValue(d) });
		}

		for (let d = 1; d <= daysInMonth; d++) {
			const cls = ['dashboard-task-reminder-calendar-day'];
			if (isCurrentMonth && d === today.getDate()) cls.push('dashboard-task-reminder-calendar-day--today');
			if (y === selectedYear && m === selectedMonth && d === selectedDay) cls.push('dashboard-task-reminder-calendar-day--selected');
			const dayBtn = calGrid.createEl('button', { cls: cls.join(' '), text: formatValue(d) });
			dayBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				selectedYear = y;
				selectedMonth = m;
				selectedDay = d;
				renderCalendar();
			});
		}

		const totalCells = firstDay + daysInMonth;
		const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
		for (let d = 1; d <= remaining; d++) {
			calGrid.createEl('button', { cls: 'dashboard-task-reminder-calendar-day dashboard-task-reminder-calendar-day--other-month', text: formatValue(d) });
		}
	};

	prevBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		viewMonth.value--;
		if (viewMonth.value < 0) { viewMonth.value = 11; viewYear.value--; }
		renderCalendar();
	});

	nextBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		viewMonth.value++;
		if (viewMonth.value > 11) { viewMonth.value = 0; viewYear.value++; }
		renderCalendar();
	});

	btnRow.querySelector('.mod-cta')!.addEventListener('click', (e) => {
		e.stopPropagation();
		const date = `${selectedYear}-${formatValue(selectedMonth + 1).padStart(2, '0')}-${formatValue(selectedDay).padStart(2, '0')}`;
		onSelect(date);
		closeCalendarPopup();
	});

	btnRow.querySelectorAll('button')[1]!.addEventListener('click', (e) => {
		e.stopPropagation();
		closeCalendarPopup();
	});

	const outsideClick = (ev: MouseEvent) => {
		if (!popup.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) {
			closeCalendarPopup();
			document.removeEventListener('mousedown', outsideClick);
		}
	};
	const timer = setTimeout(() => document.addEventListener('mousedown', outsideClick), 0);
	calendarCleanup = () => { clearTimeout(timer); document.removeEventListener('mousedown', outsideClick); };

	activeCalendarPopup = popup;
	renderCalendar();
}
