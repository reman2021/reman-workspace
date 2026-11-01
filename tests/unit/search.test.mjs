import assert from 'node:assert/strict';

export async function runSearchTests(context) {
	const { test, core, file } = context;
	await test('search supports Chinese, case, same names, Bases, media, limit and hidden directories', () => {
		const files = [file('Learning/中文.md'), file('Plan/中文.md'), file('Learning/LearningBase.base'), file('Media/中文.mp4'), file('Learning/.private/中文.md'), file('.obsidian/中文.md')];
		assert.equal(core.searchFiles(files, '中文').length, 3);
		assert.equal(core.searchFiles(files, 'LEARNINGBASE')[0].extension, 'base');
		assert.deepEqual(core.searchFiles(files, '  '), []);
		assert.equal(core.searchFiles(Array.from({ length: 30 }, (_, i) => file(`Learning/${i}.md`)), 'learning').length, 20);
	});

	await test('search handles keyboard, IME, mouse, empty state and renamed/deleted files', () => {
		const app = new core.App([file('Learning/中文.md'), file('Plan/中文.md')]);
		const parent = document.body.createDiv(); core.renderFileSearch(parent, app, path => app.opened.push(path));
		const input = parent.querySelector('input'), list = parent.querySelector('[role=listbox]');
		const query = text => { input.value = text; input.dispatchEvent(new Event('input')); };
		const key = (key, options = {}) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
		query('中文'); assert.equal(list.children.length, 2); key('ArrowDown'); key('Enter'); assert.equal(app.opened[0], 'Plan/中文.md'); assert.equal(list.hidden, true);
		query('中文'); key('Enter', { isComposing: true }); assert.equal(app.opened.length, 1); key('Escape'); assert.equal(list.hidden, true);
		query('中文'); list.children[0].click(); assert.equal(app.opened[1], 'Learning/中文.md');
		app.files[0].path = 'Learning/Renamed.md'; query('中文'); assert.equal(list.children.length, 1);
		app.files.splice(1, 1); query('中文'); assert.equal(list.querySelector('[role=status]').textContent, '没有匹配的文件');
		query(''); assert.equal(list.hidden, true);
	});
}
