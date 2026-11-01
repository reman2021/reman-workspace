import assert from 'node:assert/strict';

export async function runLibraryTests(context) {
	const { test, core, fixture, file } = context;
	await test('database config offers explicit frontmatter properties and preserves filters', () => {
		const app = new core.App([file('Learning/Course.md', '', { tags: ['Course'], type: 'Control', completed: 2, total: 5 })]);
		let saved; const config = core.parse(fixture).columns[2].libraryConfig;
		const modal = new core.LibraryConfigModal(app, config, value => { saved = value; }); modal.open();
		const filterSelect = modal.contentEl.querySelector('.dashboard-library-filter-config select'); assert.ok([...filterSelect.options].some(option => option.value === 'completed')); assert.ok(![...filterSelect.options].some(option => option.value === 'modified'));
		[...modal.contentEl.querySelectorAll('button')].find(button => button.textContent === '保存').click(); assert.deepEqual(saved.filters, JSON.parse(JSON.stringify(config.filters)));
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
}
