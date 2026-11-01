import assert from 'node:assert/strict';

export async function runIdentityTests(context) {
	const { test, core, settings } = context;
	await test('new and legacy view types open through the compatibility identity', () => {
		const app = new core.App([]), plugin = { app, manifest: { id: core.PLUGIN_ID }, settings, saveSettings: async () => {} };
		assert.equal(new core.DashboardView({ app }, plugin).getViewType(), 'reman-workspace-view');
		assert.equal(new core.DashboardView({ app }, plugin, core.LEGACY_DASHBOARD_VIEW_TYPE).getViewType(), 'apex-dashboard-view');
	});

	await test('legacy plugin settings and view state migrate only when new identity data is absent', async () => {
		const app = new core.App([]);
		app.backups.set('.obsidian/plugins/apex-dashboard/data.json', JSON.stringify({ dashboardTitle: 'Legacy title', language: 'en', stylePreset: 'carbon' }));
		let migrated;
		const plugin = new core.DashboardPlugin(); plugin.app = app;
		plugin.loadData = async () => null; plugin.saveData = async value => { migrated = value; };
		await plugin.loadSettings();
		assert.equal(plugin.settings.dashboardTitle, 'Legacy title'); assert.equal(plugin.settings.stylePreset, 'default'); assert.equal(migrated.stylePreset, 'default');
		app.saveLocalStorage(core.LEGACY_SIDEBAR_PINNED_STORAGE_KEY, 'true');
		app.saveLocalStorage(core.LEGACY_BANNER_COLLAPSED_STORAGE_KEY, 'true');
		const view = new core.DashboardView({ app }, { app, manifest: { id: core.PLUGIN_ID }, settings: plugin.settings, saveSettings: async () => {} });
		assert.equal(view.sidebarPinned, true); assert.equal(view.bannerCollapsed, true);
		let newSaveCalled = false;
		const current = new core.DashboardPlugin(); current.app = app;
		current.loadData = async () => ({ dashboardTitle: 'Current title', stylePreset: 'nordic' }); current.saveData = async () => { newSaveCalled = true; };
		await current.loadSettings();
		assert.equal(current.settings.dashboardTitle, 'Current title'); assert.equal(current.settings.stylePreset, 'default'); assert.equal(newSaveCalled, false);
	});
}
