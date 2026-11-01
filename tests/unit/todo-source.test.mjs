import assert from 'node:assert/strict';

export async function runTodoSourceTests(context) {
	const { test, core, fixture, file, settle, window } = context;
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
}
