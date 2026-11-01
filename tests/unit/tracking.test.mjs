import assert from 'node:assert/strict';

export async function runTrackingTests(context) {
	const { test, core, file } = context;
	await test('tracker reads existing numeric frontmatter and ignores missing days', () => {
		const today = new Date(); const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		const app = new core.App([file('Diary/Diary_20261024.md', '', { date, fitness: 2 }), file('Other.md', '', { date, fitness: 4 })]);
		const points = core.readAllFrontmatterTrackerData(app, 'fitness', 7);
		assert.equal(points.at(-1).value, 3); assert.equal(points[0].value, null);
	});
}
