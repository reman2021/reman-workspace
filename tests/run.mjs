import { build } from 'esbuild';
import { Window } from 'happy-dom';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
await mkdir('.test-output', { recursive: true });
await build({ entryPoints: ['tests/entry.js'], bundle: true, platform: 'node', format: 'cjs', outfile: '.test-output/tests.cjs', alias: { obsidian: './tests/obsidian-stub.js' } });
const window = new Window({ url: 'https://dashboard.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'HTMLInputElement', 'HTMLTextAreaElement', 'MouseEvent', 'KeyboardEvent', 'Event', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) globalThis[key] = key === 'window' ? window : window[key];
const core = createRequire(import.meta.url)('../.test-output/tests.cjs');
core.installDom(window);
const fixture = await readFile('tests/fixture.md', 'utf8');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); document.body.replaceChildren(); }
const file = (path, text, fm) => new core.TFile(path, text, fm);
const settings = { ...core.DEFAULT_SETTINGS, dashboardFile: 'Home', language: 'zh' };
core.setLanguage('zh');
const settle = () => new Promise(resolve => setTimeout(resolve, 150));
await test('source templates resolve local days, month/year boundaries and invalid paths', () => {
	const config = core.defaultTodoSources();
	assert.equal(core.resolveSourcePath(config.monthly.pathTemplate, new Date(2026, 11, 31)), 'Plan/2026Month/Plan_202612.md');
	assert.equal(core.resolveSourcePath(config.daily.pathTemplate, new Date(2027, 0, 1)), 'Diary/Diary_2027/Diary_202701/Diary_20270101.md');
	assert.equal(core.resolveSourcePath(config.daily.pathTemplate, new Date(2028, 1, 29)), 'Diary/Diary_2028/Diary_202802/Diary_20280229.md');
	for (const path of ['../Home', '/Home', 'C:/Home', '{{bad}}', 'Diary//Home']) assert.throws(() => core.resolveSourcePath(path));
});
await test('source parser scopes sections, states and nested tasks, excluding frontmatter/code/comments', () => {
	const content = '---\nexample: true\n- [ ] fake yaml\n---\n## 今日待办\n- [ ] [[目标|别名]]\n  - [/] [课程](../../Learning/Course.md)\n- [x] done\n- [-] cancelled\n```md\n<!--\n- [ ] fake code\n```\n<!--\n- [ ] fake comment\n-->\n### 子章节\n1. [ ] nested\n## 明日待办\n- [ ] tomorrow\n';
	const snapshot = core.readSourceTasks(content, 'Diary/today.md', '今日待办');
	assert.deepEqual(snapshot.tasks.map(task => task.state), [' ', '/', 'x', '-', ' ']);
	assert.equal(snapshot.tasks[1].indent, 2);
	assert.equal(snapshot.tasks.at(-1).heading, '今日待办 / 子章节');
	assert.equal(core.readSourceTasks(content, 'Diary/today.md', 'Missing').sectionFound, false);
	assert.ok(core.readSourceTasks(content, 'Diary/today.md').tasks.some(task => task.text === 'tomorrow'));
});
await test('source sync patches one character, preserving CRLF, line numbers and links', () => {
	const content = '## **Main Tasks**\r\n\r\n  - [/] [[Note|Alias]] ⏰ 2026-10-24 09:00\r\n## Next\r\n- [ ] untouched\r\n';
	const snapshot = core.readSourceTasks(content, 'Plan/month.md');
	assert.equal(snapshot.tasks[0].line, 2);
	assert.equal(core.patchSourceTask(content, snapshot, snapshot.tasks[0], true), content.replace('[/]', '[x]'));
	const checked = core.patchSourceTask(content, snapshot, snapshot.tasks[0], true);
	const updated = core.readSourceTasks(checked, 'Plan/month.md');
	assert.equal(core.patchSourceTask(checked, updated, updated.tasks[0], false), content.replace('[/]', '[ ]'));
});
await test('source sync relocates unique tasks but refuses edits, deleted and ambiguous duplicates', () => {
	const content = '## Tasks\n- [ ] same\n- [ ] same\n- [/] unique\n- [-] cancelled\n';
	const snapshot = core.readSourceTasks(content, 'Plan/month.md');
	assert.equal(core.patchSourceTask(content, snapshot, snapshot.tasks[1], true), content.replace('- [ ] same\n- [/] unique', '- [x] same\n- [/] unique'));
	const external = 'Intro\n' + content;
	assert.ok(core.patchSourceTask(external, snapshot, snapshot.tasks[2], true).includes('- [x] unique'));
	assert.throws(() => core.patchSourceTask(external, snapshot, snapshot.tasks[0], true));
	assert.throws(() => core.patchSourceTask(content.replace('unique', 'edited'), snapshot, snapshot.tasks[2], true));
	assert.throws(() => core.patchSourceTask(content, snapshot, snapshot.tasks[3], true));
});
await test('per-section source config roundtrips without copying source tasks', () => {
	const data = core.parse(fixture), config = core.defaultTodoSources(); config.monthly.enabled = true;
	data.columns[1].todoSources = config;
	assert.deepEqual(core.parse(core.serialize(data)).columns[1].todoSources, config);
	assert.equal(core.defaultTodoSources().daily.enabled, false);
});
await test('source controller handles missing files, template command and creation refresh', async () => {
	const app = new core.App([]), root = document.body.createDiv(), config = core.defaultTodoSources(); config.daily.enabled = true;
	const controller = new core.TodoSourceController(app, root, config); controller.load(); await settle();
	assert.ok(root.textContent.includes('当日计划尚未创建')); assert.ok([...root.querySelectorAll('button')].find(el => el.textContent === '从模板创建').disabled);
	let calls = 0;
	app.commands = { commands: { [config.daily.createCommandId]: {} }, executeCommandById: () => { calls++; return true; } };
	await controller.refresh(); [...root.querySelectorAll('button')].find(el => el.textContent === '从模板创建').click(); assert.equal(calls, 1); assert.equal(app.files.length, 0);
	const path = core.resolveSourcePath(config.daily.pathTemplate), note = file(path, '## 今日待办\n- [/] New\n'); app.files.push(note); app.vault.trigger('create', note); await settle();
	assert.equal(root.querySelectorAll('.dashboard-source-task').length, 1);
	controller.unload(); assert.equal(app.vault.count(), 0); assert.equal(controller.cleanups.length, 0);
});
await test('source controller writes source only, refreshes outside edits and renders source-relative links', async () => {
	const config = core.defaultTodoSources(); config.daily.enabled = true;
	const path = core.resolveSourcePath(config.daily.pathTemplate), note = file(path, '## 今日待办\n- [/] [[Target|Alias]]\n- [-] skip\n');
	const home = file('Home.md', fixture), app = new core.App([home, note]), root = document.body.createDiv();
	const controller = new core.TodoSourceController(app, root, config); controller.load(); await settle();
	assert.equal(root.querySelector('.dashboard-source-task-text').dataset.sourcePath, path);
	root.querySelector('.dashboard-source-task-text a').click(); assert.equal(app.opened.at(-1), 'Target');
	const check = root.querySelector('.dashboard-source-task input'); assert.equal(check.indeterminate, true); check.checked = true; check.dispatchEvent(new Event('change')); await settle();
	assert.ok(note.text.includes('[x] [[Target|Alias]]')); assert.equal(home.text, fixture); assert.equal(root.querySelectorAll('.dashboard-source-task').length, 2);
	note.text += '- [ ] External\n'; app.vault.trigger('modify', note); await settle(); assert.ok(root.textContent.includes('External'));
	controller.unload(); assert.equal(app.vault.count(), 0);
});
await test('source cards share Todo classes and stably place completed tasks last without rewriting the note', async () => {
 const config = core.defaultTodoSources(); config.daily.enabled = true;
 const path = core.resolveSourcePath(config.daily.pathTemplate), original = '## 今日待办\n- [x] First done\n- [/] In progress\n- [ ] Pending\n- [-] Cancelled\n- [X] Last done\n';
 const note = file(path, original), app = new core.App([note]), root = document.body.createDiv();
 const controller = new core.TodoSourceController(app, root, config); controller.load(); await settle();
 const card = root.querySelector('.dashboard-source-card');
 assert.ok(card.matches('.dashboard-card.dashboard-card--task'));
 assert.ok(card.querySelector('.dashboard-card-title'));
 assert.ok(card.querySelector('.dashboard-task-list'));
 assert.deepEqual([...card.querySelectorAll('.dashboard-source-task')].map(row => row.dataset.state), ['/', ' ', '-', 'x', 'X']);
 assert.ok([...card.querySelectorAll('.dashboard-source-task')].every(row => row.classList.contains('dashboard-task-item')));
 assert.equal(card.querySelectorAll('.dashboard-task-text--done').length, 3);
 assert.equal(card.querySelector('.dashboard-progress-text').textContent, '50%');
 assert.equal(note.text, original);
 const checkbox = card.querySelector('[data-state="x"] input'); checkbox.checked = false; checkbox.dispatchEvent(new Event('change')); await settle();
 assert.equal(note.text, original.replace('[x] First done', '[ ] First done'));
 controller.unload();
});
await test('source cards distinguish missing headings, no tasks and completed/cancelled tasks', async () => {
	const config = core.defaultTodoSources(); config.daily.enabled = true;
	const path = core.resolveSourcePath(config.daily.pathTemplate), note = file(path, '## Other\n- [ ] no\n'), app = new core.App([note]), root = document.body.createDiv();
	const controller = new core.TodoSourceController(app, root, config); controller.load(); await settle(); assert.ok(root.textContent.includes('未找到配置的章节'));
	note.text = '## 今日待办\n- ordinary\n'; await controller.refresh(); assert.ok(root.textContent.includes('还没有待办条目'));
	note.text = '## 今日待办\n- [x] Done\n- [-] Skip\n'; await controller.refresh(); assert.equal(root.querySelectorAll('.dashboard-source-task').length, 2);
	assert.equal(root.querySelector('.dashboard-source-show-finished'), null);
	assert.deepEqual([...root.querySelectorAll('.dashboard-source-task')].map(row => row.dataset.state), ['-', 'x']);
	assert.equal(root.querySelectorAll('.dashboard-source-task').length, 2); assert.equal(root.querySelector('[data-state="-"] input').disabled, true);
	app.files.splice(0, 1); app.vault.trigger('delete', note); await settle(); assert.ok(root.textContent.includes('尚未创建')); controller.unload();
});
await test('all Modal surfaces use the native layer; add action precedes pin', () => {
	const app = new core.App([]), root = document.body.createDiv();
	core.renderQuickActions(root, [], () => {}, () => {}, () => {}, false, () => {});
	assert.deepEqual([...root.querySelector('.dashboard-qa-btn-group').children].map(el => el.className), ['dashboard-qa-add-btn', 'dashboard-qa-pin-btn']);
	const modal = new core.TodoSourceConfigModal(app, undefined, () => {}); modal.open();
	assert.ok(modal.modalEl.matches('.modal.modal--dashboard')); assert.ok(modal.contentEl.matches('.modal-content.dashboard-modal'));
	assert.equal(modal.containerEl.classList.contains('modal--dashboard'), false);
	assert.equal(modal.contentEl.querySelector('h2').textContent, '计划卡片配置');
	assert.equal(modal.contentEl.querySelector('p'), null);
	assert.equal(modal.contentEl.querySelectorAll('input[type="text"]')[1].placeholder, '留空读取全文');
	modal.close();
});
await test('source controller follows midnight/year rollover and foreground refresh', async () => {
	const RealDate = Date, realSetInterval = window.setInterval;
	let now = new RealDate(2026, 11, 31, 23, 59).getTime(), tick;
	globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
	window.setInterval = callback => { tick = callback; return 0; };
	const config = core.defaultTodoSources(); config.daily.enabled = true; config.monthly.enabled = true;
	const app = new core.App([
		file(core.resolveSourcePath(config.daily.pathTemplate, new RealDate(2026, 11, 31)), '## 今日待办\n- [ ] Dec day\n'),
		file(core.resolveSourcePath(config.monthly.pathTemplate, new RealDate(2026, 11, 31)), '- [ ] Dec month\n'),
		file(core.resolveSourcePath(config.daily.pathTemplate, new RealDate(2027, 0, 1)), '## 今日待办\n- [ ] Jan day\n'),
		file(core.resolveSourcePath(config.monthly.pathTemplate, new RealDate(2027, 0, 1)), '- [ ] Jan month\n'),
	]), root = document.body.createDiv(), controller = new core.TodoSourceController(app, root, config);
	try {
		controller.load(); await settle(); assert.ok(root.textContent.includes('Dec day'));
		now = new RealDate(2027, 0, 1, 0, 0).getTime(); tick(); await settle(); assert.ok(root.textContent.includes('Jan day')); assert.ok(root.textContent.includes('Jan month')); assert.ok(!root.textContent.includes('Dec day'));
		app.files.at(-2).text = '## 今日待办\n- [ ] Foreground update\n'; window.dispatchEvent(new Event('focus')); await settle(); assert.ok(root.textContent.includes('Foreground update'));
	} finally { controller.unload(); globalThis.Date = RealDate; window.setInterval = realSetInterval; }
	assert.equal(app.vault.count(), 0);
});
await test('source controller rejects ambiguous writes, reports failures and follows renamed files', async () => {
	const config = core.defaultTodoSources(); config.daily.enabled = true;
	const path = core.resolveSourcePath(config.daily.pathTemplate), note = file(path, '## 今日待办\n- [ ] same\n- [ ] same\n'), root = document.body.createDiv(), app = new core.App([note]);
	const controller = new core.TodoSourceController(app, root, config), oldError = console.error;
	try {
		controller.load(); await settle(); const checkbox = root.querySelector('.dashboard-source-task input');
		note.text = 'Intro\n' + note.text; const before = note.text, noticeCount = core.Notice.messages.length;
		console.error = () => {}; checkbox.checked = true; checkbox.dispatchEvent(new Event('change')); await settle();
		assert.equal(note.text, before); assert.equal(core.Notice.messages.length, noticeCount + 1); assert.equal(root.querySelector('.dashboard-source-task input').checked, false);
		app.vault.process = async () => { throw new Error('Test write failure'); };
		const retry = root.querySelector('.dashboard-source-task input'); retry.checked = true; retry.dispatchEvent(new Event('change')); await settle(); assert.equal(note.text, before);
		note.path = 'Diary/Renamed.md'; app.vault.trigger('rename', note, path); await settle(); assert.ok(root.textContent.includes('尚未创建')); assert.equal(config.daily.pathTemplate, core.defaultTodoSources().daily.pathTemplate);
	} finally { console.error = oldError; controller.unload(); }
});
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
await test('save queue, Todo edit/reorder, archive/restore and backups preserve legacy data', async () => {
	const home = file('Home.md', fixture), app = new core.App([home]);
	const sync = new core.SyncEngine(app, settings, '.obsidian/plugins/reman-workspace/backups'); await sync.init();
	await sync.editTask('todo-1', 0, 'Edited'); await sync.reorderTask('todo-1', 0, 1); await sync.archiveCard('todo-1'); await sync.restoreCard('todo-1');
	await sync.writeQueue;
	const data = core.parse(home.text); assert.equal(data.columns[1].cards[0].tasks[1].text, 'Edited'); assert.equal(data.columns[1].cards[0].archived, false);
	assert.ok(home.text.includes('custom: keep this exact field')); assert.ok(app.backups.size > 0); assert.ok(app.backups.size <= 6);
	sync.destroy(); assert.equal(app.vault.count(), 0);
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
await test('tracker reads existing numeric frontmatter and ignores missing days', () => {
	const today = new Date(); const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	const app = new core.App([file('Diary/Diary_20261024.md', '', { date, fitness: 2 }), file('Other.md', '', { date, fitness: 4 })]);
	const points = core.readAllFrontmatterTrackerData(app, 'fitness', 7);
	assert.equal(points.at(-1).value, 3); assert.equal(points[0].value, null);
});
await test('banner retains remote images, color, quote library and image-list editor', () => {
	const app = new core.App([]), banner = core.parse(fixture).banner;
	const root = document.body.createDiv({ cls: 'reman-workspace-root' });
	const el = core.renderBanner(root, banner, () => {}, app); assert.equal(el.querySelector('.dashboard-banner-quote').style.color, '#123456');
	assert.equal(el.querySelector('.dashboard-banner-quote-decor'), null); assert.equal(el.querySelector('.dashboard-banner-quote').textContent, banner.quote);
	assert.equal(core.resolveVaultImage(app, 'https://example.com/banner.png'), 'https://example.com/banner.png');
	let saved; const modal = new core.BannerEditModal(app, banner, updates => { saved = updates; }); modal.open();
	const fields = [...modal.contentEl.querySelectorAll('.dashboard-modal-field')];
	assert.equal(fields.length, 5);
	assert.ok(fields.every(field => {
		const label = field.querySelector(':scope > label'), control = field.querySelector(':scope > input, :scope > textarea');
		return label?.htmlFor && control?.id === label.htmlFor;
	}));
	assert.ok([...modal.contentEl.querySelectorAll('input[type="text"], textarea')].every(field => field.classList.contains('dashboard-modal-input')));
	assert.equal(modal.contentEl.querySelector('textarea').placeholder, '名言库为空时显示的备用名言');
	assert.equal(modal.contentEl.querySelectorAll('textarea')[1].placeholder, '每行一个路径或网址，多张图片自动轮播');
	assert.ok(modal.contentEl.querySelector('input[type="color"]').classList.contains('dashboard-banner-color-input'));
	assert.ok(modal.contentEl.querySelector('.dashboard-banner-color-reset'));
	modal.contentEl.querySelector('.mod-cta').click(); assert.equal(saved.quoteLibraryPath, banner.quoteLibraryPath); assert.deepEqual(saved.images, banner.images);
});
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
await test('repeated view open/close releases vault and metadata listeners and intervals', async () => {
	const app = new core.App([file('Home.md', fixture)]), plugin = { app, manifest: { id: core.PLUGIN_ID }, settings, saveSettings: async () => {} };
	for (let i = 0; i < 3; i++) {
		const view = new core.DashboardView({ app }, plugin); await view.onOpen(); assert.ok(app.vault.count() > 0);
		await view.onClose(); view.containerEl.remove(); assert.equal(app.vault.count(), 0); assert.equal(app.metadataCache.count(), 0); assert.equal(view.reminderTimer, null);
	}
});
await window.happyDOM.close();
console.log(`${count} regression scenarios passed`);
