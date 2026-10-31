import type { Modal } from 'obsidian';
import { findDashboardRoot } from './identity';

/** Style Obsidian's actual modal surface, leaving the content as a plain layout. */
export function initializeDashboardModal(modal: Modal): void {
	modal.containerEl.removeClass('modal--dashboard');
	modal.modalEl.addClass('modal--dashboard');
	modal.contentEl.addClass('dashboard-modal');
	const source = findDashboardRoot();
	const theme = source?.dataset.theme ?? modal.containerEl.dataset.theme;
	if (theme) modal.modalEl.dataset.theme = theme;
	modal.containerEl.removeAttribute('data-theme');
	inheritDashboardThemeVars(modal.modalEl, source);
	modal.containerEl.querySelector('.modal-bg')?.addClass('modal-bg--dashboard');
}

export function inheritDashboardThemeVars(target: HTMLElement, source?: HTMLElement | null): void {
	const dashboardRoot = findDashboardRoot(source);
	if (!(dashboardRoot instanceof HTMLElement)) return;
	const styles = getComputedStyle(dashboardRoot);
	const themeVars = [
		'--db-bg',
		'--db-bg-card',
		'--db-bg-card-hover',
		'--db-bg-hover',
		'--db-bg-input',
		'--db-bg-btn',
		'--db-bg-btn-hover',
		'--db-border',
		'--db-border-card',
		'--db-border-btn',
		'--db-border-input',
		'--db-border-input-focus',
		'--db-text',
		'--db-text-muted',
		'--db-text-faint',
		'--db-text-secondary',
		'--db-text-inverse',
		'--db-text-inverse-muted',
		'--db-accent',
		'--db-accent-light',
		'--db-danger',
		'--db-radius-control',
		'--db-radius-card',
		'--db-radius-panel',
		'--db-radius-round',
		'--db-radius-md',
		'--db-radius-sm',
		'--db-radius-lg',
		'--db-motion-fast',
		'--db-motion-standard',
		'--db-focus-ring',
		'--db-font',
		'--db-backdrop-blur',
		'--db-shadow-card',
		'--db-shadow-card-hover',
	];
	for (const name of themeVars) {
		const value = styles.getPropertyValue(name).trim();
		if (value) target.style.setProperty(name, value);
	}
}
