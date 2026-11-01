import { type App, setIcon } from 'obsidian';
import type { DashboardCard, RenderCallbacks } from '../../core/types';
import { t } from '../../core/i18n';
import { attachFileSuggest } from '../../ui/file-suggest';
import { renderTextWithLinks } from '../../ui/rich-text';
import { createReminderButton } from './reminder-popup';

let taskDragSource: { cardId: string; taskIndex: number } | null = null;

export function renderTaskBody(container: HTMLElement, card: DashboardCard, callbacks: RenderCallbacks, app: App): void {
	const list = container.createDiv({ cls: 'dashboard-task-list' });
	list.dataset.cardId = card.id;

	// When the list is empty, make it a drop target so tasks can be dragged in
	list.addEventListener('dragover', (e) => {
		if (!taskDragSource) return;
		if (taskDragSource.cardId === card.id) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		list.addClass('dashboard-task-list--drop-target');
	});

	list.addEventListener('dragleave', (e) => {
		if (!list.contains(e.relatedTarget as Node)) {
			list.removeClass('dashboard-task-list--drop-target');
		}
	});

	list.addEventListener('drop', (e) => {
		e.preventDefault();
		list.removeClass('dashboard-task-list--drop-target');
		if (!taskDragSource) return;
		if (taskDragSource.cardId === card.id) return;
		callbacks.onTaskMoveToCard(taskDragSource.cardId, taskDragSource.taskIndex, card.id, card.tasks.length);
	});

	card.tasks.forEach((task, index) => {
		const item = list.createDiv({ cls: 'dashboard-task-item' });
		item.setAttribute('draggable', 'true');
		item.dataset.taskIndex = String(index);
		item.dataset.cardId = card.id;

		// Mobile: tap to toggle action buttons visibility
		item.addEventListener('touchstart', () => {
			const wasActive = item.hasClass('dashboard-task-item--touched');
			document.querySelectorAll('.dashboard-task-item--touched').forEach(el => {
				el.removeClass('dashboard-task-item--touched');
			});
			if (!wasActive) {
				item.addClass('dashboard-task-item--touched');
			}
		}, { passive: true });

		const checkbox = item.createEl('input', {
			cls: 'dashboard-task-checkbox',
			attr: { type: 'checkbox' },
		});
		checkbox.checked = task.checked;
		checkbox.addEventListener('change', () => {
			callbacks.onCheckboxToggle(card.id, index, checkbox.checked);
		});

		const label = item.createSpan({
			cls: task.checked ? 'dashboard-task-text dashboard-task-text--done' : 'dashboard-task-text',
		});
		renderTextWithLinks(label, task.text, app);
		label.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			const currentText = label.getText();
			label.empty();

			// Disable dragging on the parent item while editing
			item.setAttribute('draggable', 'false');

			const textarea = label.createEl('textarea', {
				cls: 'dashboard-task-edit-textarea',
				text: task.text,
			});

			// Auto-size: fit content and expand as user types
			const autoResize = () => {
				textarea.setCssProps({ 'height': 'auto' });
				textarea.setCssProps({ 'height': textarea.scrollHeight + 'px' });
			};
			autoResize();

			textarea.focus();
			textarea.setSelectionRange(textarea.value.length, textarea.value.length);

			const finish = (save: boolean) => {
				const newText = textarea.value.trim();
				if (save && newText && newText !== task.text) {
					callbacks.onTaskEdit(card.id, index, newText);
				} else {
					label.empty();
					label.setText(currentText);
				}
				item.setAttribute('draggable', 'true');
			};

			textarea.addEventListener('input', autoResize);

			textarea.addEventListener('keydown', (ke) => {
				if (ke.key === 'Enter' && !ke.shiftKey) {
					ke.preventDefault();
					finish(true);
				} else if (ke.key === 'Escape') {
					ke.preventDefault();
					finish(false);
				}
			});

			textarea.addEventListener('blur', () => {
				finish(true);
			});
		});

		const delBtn = item.createEl('button', {
			cls: 'dashboard-task-delete',
			attr: { 'aria-label': t('renderer.deleteTask') },
		});
		setIcon(delBtn, 'x');
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onTaskDelete(card.id, index);
		});

		const reminderBtn = createReminderButton(item, card.id, index, task, callbacks);
		item.appendChild(reminderBtn);

		item.addEventListener('dragstart', (e) => {
			e.stopPropagation();
			taskDragSource = { cardId: card.id, taskIndex: index };
			item.addClass('dashboard-task-item--dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', String(index));
			}
		});

		item.addEventListener('dragend', () => {
			item.removeClass('dashboard-task-item--dragging');
			document.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
				(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
			});
			taskDragSource = null;
		});

		item.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (!taskDragSource) return;
			if (taskDragSource.cardId === card.id && taskDragSource.taskIndex === index) return;
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			document.querySelectorAll('.dashboard-task-item--drag-over').forEach(el => {
				(el as HTMLElement).removeClass('dashboard-task-item--drag-over');
			});
			item.addClass('dashboard-task-item--drag-over');
		});

		item.addEventListener('dragleave', () => {
			item.removeClass('dashboard-task-item--drag-over');
		});

		item.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			item.removeClass('dashboard-task-item--drag-over');
			if (!taskDragSource) return;
			if (taskDragSource.cardId === card.id && taskDragSource.taskIndex === index) return;

			if (taskDragSource.cardId === card.id) {
				callbacks.onTaskReorder(card.id, taskDragSource.taskIndex, index);
			} else {
				callbacks.onTaskMoveToCard(taskDragSource.cardId, taskDragSource.taskIndex, card.id, index);
			}
		});
	});

	const addRow = container.createDiv({ cls: 'dashboard-task-add' });
	const input = addRow.createEl('input', {
		cls: 'dashboard-task-input',
		attr: { type: 'text', placeholder: t('renderer.addTask') },
	});
	const taskSuggest = attachFileSuggest(input, app);
	input.addEventListener('keydown', (e) => {
		if (taskSuggest.isActive()) return;
		if (e.key === 'Enter' && input.value.trim()) {
			callbacks.onTaskAdd(card.id, input.value.trim());
			input.value = '';
		}
	});

	if (card.tasks.length > 0) {
		const checkedCount = card.tasks.filter(t => t.checked).length;
		const total = card.tasks.length;
		const percent = Math.round((checkedCount / total) * 100);

		const progressWrap = container.createDiv({ cls: 'dashboard-progress' });
		const bar = progressWrap.createDiv({ cls: 'dashboard-progress-bar' });
		bar.createDiv({
			cls: 'dashboard-progress-fill',
			attr: { style: `width: ${percent}%` },
		});
		progressWrap.createSpan({
			cls: 'dashboard-progress-text',
			text: `${percent}%`,
		});
	}
}
