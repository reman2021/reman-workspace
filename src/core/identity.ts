export const PLUGIN_ID = 'reman-workspace';
export const PLUGIN_NAME = 'Reman Workspace';
export const LEGACY_PLUGIN_ID = 'apex-dashboard';

export const DASHBOARD_VIEW_TYPE = 'reman-workspace-view';
export const LEGACY_DASHBOARD_VIEW_TYPE = 'apex-dashboard-view';

export const DASHBOARD_ROOT_CLASS = 'reman-workspace-root';
export const LEGACY_DASHBOARD_ROOT_CLASS = 'apex-dashboard-root';
export const DASHBOARD_ROOT_SELECTOR = `.${DASHBOARD_ROOT_CLASS}, .${LEGACY_DASHBOARD_ROOT_CLASS}`;

export const COLLAPSED_STORAGE_KEY = 'reman-workspace-collapsed';
export const LEGACY_COLLAPSED_STORAGE_KEY = 'apex-dashboard-collapsed';
export const SHOW_ARCHIVED_STORAGE_KEY = 'reman-workspace-show-archived';
export const LEGACY_SHOW_ARCHIVED_STORAGE_KEY = 'apex-dashboard-show-archived';
export const SIDEBAR_PINNED_STORAGE_KEY = 'reman-workspace-sidebar-pinned';
export const LEGACY_SIDEBAR_PINNED_STORAGE_KEY = 'apex-dashboard-sidebar-pinned';
export const BANNER_COLLAPSED_STORAGE_KEY = 'reman-workspace-banner-collapsed';
export const LEGACY_BANNER_COLLAPSED_STORAGE_KEY = 'apex-dashboard-banner-collapsed';

export function findDashboardRoot(source?: HTMLElement | null): HTMLElement | null {
	const closest = source?.closest(DASHBOARD_ROOT_SELECTOR);
	if (closest instanceof HTMLElement) return closest;
	return document.querySelector<HTMLElement>(DASHBOARD_ROOT_SELECTOR);
}
