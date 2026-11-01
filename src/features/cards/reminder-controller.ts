import type { App } from 'obsidian';
import type { DashboardData } from '../../core/types';
import { ReminderNoticeModal } from './reminder-notice';

type ReminderWriter = (cardId: string, taskIndex: number, reminder?: string) => void | Promise<void>;

export class ReminderController {
	private static readonly CHECK_INTERVAL_MS = 60 * 1000;
	private timer: ReturnType<typeof setInterval> | null = null;
	private fired = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly getData: () => DashboardData | null,
		private readonly writeReminder: ReminderWriter,
	) {}

	start(): void {
		this.check();
		this.timer = setInterval(() => this.check(), ReminderController.CHECK_INTERVAL_MS);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	reset(): void {
		this.fired.clear();
	}

	private check(): void {
		const data = this.getData();
		if (!data) return;
		const now = new Date();

		for (const column of data.columns) {
			for (const card of column.cards) {
				for (let taskIndex = 0; taskIndex < card.tasks.length; taskIndex++) {
					const task = card.tasks[taskIndex]!;
					if (!task.reminder || task.checked) continue;
					const key = `${card.id}-${taskIndex}`;
					if (this.fired.has(key)) continue;

					const [dateText, timeText] = task.reminder.trim().split(/\s+/);
					if (!dateText || !timeText) continue;
					const [year, month, day] = dateText.split('-').map(Number);
					const [hour, minute] = timeText.split(':').map(Number);
					if (!year || !month || !day) continue;
					const due = new Date(year, month - 1, day, hour ?? 0, minute ?? 0);
					if (now < due) continue;

					this.fired.add(key);
					const cleanText = task.text.replace(/\[\[[^\]]+\]\]/g, match => {
						const inner = match.slice(2, -2);
						return inner.split('|').pop()?.split('/').pop()?.replace(/\.md$/, '') ?? inner;
					});
					this.show(cleanText, card.id, taskIndex);
				}
			}
		}
	}

	private show(taskText: string, cardId: string, taskIndex: number): void {
		new ReminderNoticeModal(
			this.app,
			taskText,
			() => void this.writeReminder(cardId, taskIndex, undefined),
			() => {
				const snoozed = new Date(Date.now() + 60 * 60 * 1000);
				const pad = (value: number) => String(value).padStart(2, '0');
				const reminder = `${snoozed.getFullYear()}-${pad(snoozed.getMonth() + 1)}-${pad(snoozed.getDate())} ${pad(snoozed.getHours())}:${pad(snoozed.getMinutes())}`;
				this.fired.delete(`${cardId}-${taskIndex}`);
				void this.writeReminder(cardId, taskIndex, reminder);
			},
		).open();
	}
}
