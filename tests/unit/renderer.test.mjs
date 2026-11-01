import assert from 'node:assert/strict';

export async function runRendererTests(context) {
	const { test, core, fixture, file, settings } = context;
	await test('weekly strip shows seven days from Monday and highlights today', () => {
		const root = document.body.createDiv();
		core.renderSidebarWeekCalendar(root);
		const cells = [...root.querySelectorAll('.dashboard-sidebar-week-cell')];
		assert.equal(cells.length, 7);
		assert.equal(root.querySelectorAll('.dashboard-sidebar-week-cell--today').length, 1);
		const today = new Date();
		assert.equal(root.querySelector('.dashboard-sidebar-week-cell--today .dashboard-sidebar-week-date').textContent, String(today.getDate()));
		const monday = new Date(today); monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
		assert.equal(cells[0].querySelector('.dashboard-sidebar-week-date').textContent, String(monday.getDate()));
	});

	await test('render hides legacy weather, preserves collapse and supports Todo edits', () => {
		const app = new core.App([]), root = document.body.createDiv({ cls: 'reman-workspace-root' }), data = core.parse(fixture);
		app.saveLocalStorage(core.LEGACY_COLLAPSED_STORAGE_KEY, JSON.stringify(['Memo']));
		const edits = [];
		const callbacks = new Proxy({}, { get: (_, name) => (...args) => edits.push([name, ...args]) });
		core.renderDashboard(root, data, callbacks, app, settings);
		assert.equal(root.querySelector('[data-card-type=weather]'), null);
		assert.equal(root.querySelectorAll('[data-card-type=task]').length, 1);
		assert.ok(root.querySelector('.dashboard-section-row').classList.contains('dashboard-section-row--collapsed'));
		const header = root.querySelector('.dashboard-section-toggle'); header.click();
		assert.ok(!root.querySelector('.dashboard-section-row').classList.contains('dashboard-section-row--collapsed'));
		assert.equal(app.loadLocalStorage(core.COLLAPSED_STORAGE_KEY), '[]');
		core.renderDashboard(root, data, callbacks, app, settings); assert.ok(!root.querySelector('.dashboard-section-row').classList.contains('dashboard-section-row--collapsed'));
		const taskInput = root.querySelector('.dashboard-task-input'); taskInput.value = 'New task'; taskInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		assert.ok(edits.some(([name]) => name === 'onTaskAdd'));
		core.destroyAllCharts();
	});

	await test('legacy Notes sections normalize to unified notes and covers render only for non-empty paths', () => {
		const markdown = '---\ncolumns:\n  - name: Notes\n    color: "#10b981"\n    type: notes\n---\n\n## Notes\n\n### Plain\nid: plain\ntype: project\n\n### Covered\nid: covered\ntype: project\ncover: Missing.png\n';
		const data = core.parse(markdown);
		assert.equal(data.columns[0].sectionType, 'projects');
		assert.ok(core.serialize(data).includes('type: projects'));
		assert.ok(!core.serialize(data).includes('type: notes'));
		const root = document.body.createDiv({ cls: 'reman-workspace-root' });
		const callbacks = new Proxy({}, { get: () => () => {} });
		core.renderDashboard(root, data, callbacks, new core.App([]), settings);
		assert.equal(root.querySelector('[data-card-id="plain"] .dashboard-project-cover'), null);
		assert.ok(root.querySelector('[data-card-id="covered"] .dashboard-project-cover--default'));
	});

	await test('empty sections collapse while enabled Todo sources keep their content area', () => {
		const data = core.parse(core.generateDefaultMarkdown());
		const root = document.body.createDiv({ cls: 'reman-workspace-root' });
		const callbacks = new Proxy({}, { get: (_, name) => name === 'onTodoSourcesMount' ? () => {} : () => {} });
		core.renderDashboard(root, data, callbacks, new core.App([]), settings);
		assert.equal(root.querySelectorAll('.dashboard-section-row--empty').length, 2);
		data.columns[1].todoSources = core.defaultTodoSources();
		data.columns[1].todoSources.daily.enabled = true;
		core.renderDashboard(root, data, callbacks, new core.App([]), settings);
		assert.ok(!root.querySelector('[data-column="Todo"]').classList.contains('dashboard-section-row--empty'));
	});

	await test('repeated view open/close releases vault and metadata listeners and intervals', async () => {
		const app = new core.App([file('Home.md', fixture)]), plugin = { app, manifest: { id: core.PLUGIN_ID }, settings, saveSettings: async () => {} };
		for (let i = 0; i < 3; i++) {
			const view = new core.DashboardView({ app }, plugin); await view.onOpen(); assert.ok(app.vault.count() > 0);
			await view.onClose(); view.containerEl.remove(); assert.equal(app.vault.count(), 0); assert.equal(app.metadataCache.count(), 0); assert.equal(view.reminderController.timer, null);
		}
	});
}
