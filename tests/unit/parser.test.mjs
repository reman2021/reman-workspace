import assert from 'node:assert/strict';

export async function runParserTests(context) {
	const { test, core, fixture, settings } = context;
	await test('roundtrip preserves archive, banner, actions, database and tracking', () => {
		const before = core.parse(fixture), after = core.parse(core.serialize(before));
		assert.deepEqual(after, before);
		assert.equal(after.columns[1].cards[1].archivedAt, '2026-07-09');
		assert.equal(after.banner.quoteLibraryPath, 'Library/quotes.md');
		assert.equal(after.columns[2].libraryConfig.viewMode, 'table');
		assert.equal(after.columns[3].heatmapItems[0].key, 'fitness');
	});

	await test('legacy weather block is opaque and byte-stable across another card edit', () => {
		const data = core.parse(fixture); data.columns[0].cards[0].body += '\nNew thought';
		const weather = fixture.slice(fixture.indexOf('### Old weather')).trim();
		const saved = core.serialize(data); assert.ok(saved.includes(weather));
		assert.equal(core.parse(saved).columns[4].cards[0].type, 'weather');
	});

	await test('CRLF weather content and tracker type/style survive saving', () => {
		const raw = fixture.replaceAll('\n', '\r\n');
		const data = core.parse(raw);
		const weather = raw.slice(raw.indexOf('### Old weather')).trimEnd();
		assert.ok(core.serialize(data).includes(weather));
		const board = core.parse(fixture + '\n### Tracker\nid: tracker-test\ntype: tracker\ntrack: fitness\ndays: 30\nstyle: bar\n');
		const after = core.parse(core.serialize(board));
		assert.equal(after.columns.at(-1).cards.at(-1).type, 'tracker');
		assert.deepEqual(after.columns.at(-1).cards.at(-1).trackerConfig, { key: 'fitness', days: 30, style: 'bar' });
	});

	await test('new boards have only empty Memo and Todo sections', () => {
		const data = core.parse(core.generateDefaultMarkdown());
		assert.deepEqual(data.columns.map(column => column.sectionType), ['memo', 'todo']);
		assert.equal(data.columns.flatMap(column => column.cards).length, 0);
		assert.ok(!Object.keys(settings).some(key => /pomodoro|weather|reading|lunar|countdown/i.test(key)));
	});
}
