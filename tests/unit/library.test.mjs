import assert from 'node:assert/strict';

export async function runLibraryTests(context) {
	const { test, core, fixture, file } = context;
	await test('database config offers explicit frontmatter properties and preserves filters', () => {
		const app = new core.App([file('Learning/Course.md', '', { tags: ['Course'], type: 'Control', completed: 2, total: 5 })]);
		let saved; const config = core.parse(fixture).columns[2].libraryConfig;
		const modal = new core.LibraryConfigModal(app, config, value => { saved = value; }); modal.open();
		const filterSelect = modal.contentEl.querySelector('.dashboard-library-filter-config select'); assert.ok([...filterSelect.options].some(option => option.value === 'completed')); assert.ok(![...filterSelect.options].some(option => option.value === 'modified'));
		[...modal.contentEl.querySelectorAll('button')].find(button => button.textContent === '保存').click(); assert.deepEqual(saved.filters, JSON.parse(JSON.stringify(config.filters)));
		assert.equal(Object.hasOwn(saved, 'tableColumns'), false);
	});

	await test('database filter editor stays collapsed, searches values and preserves selections', () => {
		const app = new core.App([
			file('A.md', '', { type: 'Control' }),
			file('B.md', '', { type: 'Planning' }),
			file('C.md', '', { type: 'Reference' }),
		]);
		let saved;
		const config = { filters: [{ property: 'type', values: ['Control'] }], viewMode: 'grid', sortBy: 'modified', sortDesc: true };
		const modal = new core.LibraryConfigModal(app, config, value => { saved = value; }); modal.open();
		assert.equal(modal.contentEl.querySelector('.dashboard-library-filter-config-body'), null);
		modal.contentEl.querySelector('.dashboard-library-filter-config-summary').click();
		const search = modal.contentEl.querySelector('.dashboard-library-filter-config-search');
		search.value = 'plan'; search.dispatchEvent(new Event('input'));
		const labels = [...modal.contentEl.querySelectorAll('.dashboard-library-filter-config-value')];
		assert.deepEqual(labels.map(label => label.textContent), ['Planning']);
		labels[0].querySelector('input').click();
		[...modal.contentEl.querySelectorAll('button')].find(button => button.textContent === '保存').click();
		assert.deepEqual(saved.filters[0].values.sort(), ['Control', 'Planning']);
	});

	await test('table column editor uses matching properties and persists selection order only after interaction', () => {
		const app = new core.App([
			file('Control.md', '', { type: 'Control', status: 'active' }),
			file('Planning.md', '', { type: 'Planning', priority: 2 }),
			file('Outside.md', '', { kind: 'Other', secret: 'hidden' }),
		]);
		let saved;
		const config = { filters: [{ property: 'type', values: ['Control'] }], viewMode: 'table', sortBy: 'modified', sortDesc: true };
		const modal = new core.LibraryConfigModal(app, config, value => { saved = value; }); modal.open();
		const editor = modal.contentEl.querySelector('.dashboard-library-table-column-editor');
		assert.equal(editor.open, false);
		assert.ok(modal.contentEl.querySelector('.dashboard-library-filter-editor').compareDocumentPosition(editor) & 4);
		editor.querySelector('summary').click(); assert.equal(editor.open, true);
		assert.equal(modal.contentEl.querySelector('.dashboard-library-table-column-fixed'), null);
		const listed = () => [...modal.contentEl.querySelectorAll('.dashboard-library-table-column-row')].map(row => row.dataset.tableColumn);
		assert.deepEqual(listed(), ['modified', 'type', 'status']);
		assert.ok(!listed().includes('secret')); assert.ok(!listed().includes('priority'));

		modal.contentEl.querySelector('.dashboard-library-filter-config-summary').click();
		const planning = [...modal.contentEl.querySelectorAll('.dashboard-library-filter-config-value')].find(label => label.textContent === 'Planning');
		planning.querySelector('input').click();
		assert.ok(listed().includes('priority')); assert.ok(!listed().includes('secret'));

		const search = modal.contentEl.querySelector('.dashboard-library-table-column-search');
		search.value = 'sta'; search.dispatchEvent(new Event('input'));
		assert.deepEqual(listed(), ['status']);
		search.value = ''; search.dispatchEvent(new Event('input'));
		modal.contentEl.querySelector('[data-table-column="modified"] input').click();
		modal.contentEl.querySelector('[data-table-column="priority"] [data-direction="up"]').click();
		modal.contentEl.querySelector('[data-table-column="priority"] [data-direction="up"]').click();
		const control = [...modal.contentEl.querySelectorAll('.dashboard-library-filter-config-value')].find(label => label.textContent === 'Control');
		control.querySelector('input').click();
		assert.ok(!listed().includes('status'));
		[...modal.contentEl.querySelectorAll('button')].find(button => button.textContent === '保存').click();
		assert.deepEqual(saved.tableColumns, ['priority', 'type']);
	});

	await test('table column editor removes configured properties that no longer match any note', () => {
		const app = new core.App([file('Control.md', '', { type: 'Control', status: 'active' })]);
		let saved;
		const config = { filters: [{ property: 'type', values: ['Control'] }], viewMode: 'table', sortBy: 'modified', sortDesc: true, tableColumns: ['legacy', 'status'] };
		const modal = new core.LibraryConfigModal(app, config, value => { saved = value; }); modal.open();
		assert.equal(modal.contentEl.querySelector('[data-table-column="legacy"]'), null);
		[...modal.contentEl.querySelectorAll('button')].find(button => button.textContent === '保存').click();
		assert.deepEqual(saved.tableColumns, ['status']);
	});
}
