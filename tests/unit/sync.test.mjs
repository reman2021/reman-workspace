import assert from 'node:assert/strict';

export async function runSyncTests(context) {
	const { test, core, fixture, file, settings } = context;
	await test('save queue, Todo edit/reorder, archive/restore and backups preserve legacy data', async () => {
		const home = file('Home.md', fixture), app = new core.App([home]);
		const sync = new core.SyncEngine(app, settings, '.obsidian/plugins/reman-workspace/backups'); await sync.init();
		await sync.editTask('todo-1', 0, 'Edited'); await sync.reorderTask('todo-1', 0, 1); await sync.archiveCard('todo-1'); await sync.restoreCard('todo-1');
		await sync.writeQueue;
		const data = core.parse(home.text); assert.equal(data.columns[1].cards[0].tasks[1].text, 'Edited'); assert.equal(data.columns[1].cards[0].archived, false);
		assert.ok(home.text.includes('custom: keep this exact field')); assert.ok(app.backups.size > 0); assert.ok(app.backups.size <= 6);
		sync.destroy(); assert.equal(app.vault.count(), 0);
	});

	await test('sync emits scoped updates and silently persists local database controls', async () => {
		const home = file('Home.md', fixture), app = new core.App([home]);
		const updates = [];
		const sync = new core.SyncEngine(app, settings, '.obsidian/plugins/reman-workspace/backups');
		sync.onDataUpdate((_data, update) => updates.push(update)); await sync.init();
		const database = sync.getData().columns.find(column => column.name === 'Database');
		const writes = app.modifyCount;
		await sync.updateLibraryConfig('Database', { ...database.libraryConfig, viewMode: 'grid' }, false);
		assert.equal(updates.length, 1); assert.equal(app.modifyCount, writes + 1);
		await sync.addCard('Memo');
		assert.deepEqual(updates.at(-1), { scope: 'columns', columnNames: ['Memo'] });
		sync.destroy();
	});
}
