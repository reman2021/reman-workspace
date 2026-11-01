import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

await mkdir('.test-output', { recursive: true });
const result = await build({ entryPoints: ['tests/support/browser-entry.js'], bundle: true, platform: 'browser', format: 'iife', write: false, alias: { obsidian: './tests/support/obsidian-stub.js' } });
const script = result.outputFiles[0].text;
const styles = await readFile('styles.css', 'utf8');
assert.doesNotMatch(styles, /transition:\s*all\b/);
assert.match(styles, /--db-radius-control:\s*2px/);
assert.match(styles, /--db-radius-card:\s*3px/);
assert.match(styles, /--db-radius-panel:\s*4px/);
let fixture = await readFile('tests/fixtures/dashboard.md', 'utf8');
fixture = fixture.replace('  images: ["https://example.com/banner.png", "Assets/banner.png"]', '  images: []');
fixture = fixture.replace('  - name: Legacy', '  - name: Empty\n    color: "#6366f1"\n    type: projects\n  - name: Legacy');
fixture = fixture.replace(/\r?\n## Legacy\r?\n/, '\n## Empty\n\n## Legacy\n');
fixture += '\n### Fitness tracker\nid: tracker-1\ntype: tracker\ntrack: fitness\ndays: 7\n';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root { --font-interface: system-ui; --font-text: system-ui; --background-primary: #fff; --background-secondary: #f4f4f4; --background-modifier-hover: #e7e7ee; --background-modifier-border: #ddd; --text-normal: #252525; --text-muted: #666; --text-faint: #999; --text-accent: #514acb; --text-on-accent: #fff; --text-error: #c9363e; --interactive-accent: #6366f1; }
body { margin:0; font:14px system-ui; } * { box-sizing:border-box; } button,input,textarea,select { font:inherit; } [hidden] { display:none!important; } .modal-container {position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;} .modal-bg {position:absolute;inset:0;} .modal {position:relative;background:var(--background-primary);border:1px solid #aaa;padding:24px;border-radius:12px;} .modal-close-button {position:absolute;right:10px;top:10px;cursor:pointer;} .modal-content {margin-top:24px;} .setting-item {display:flex;justify-content:space-between;gap:10px;padding:6px;} .setting-item button {margin-left:6px;}
</style><style>${styles}</style></head><body class="theme-light"><script>${script}</script><script>startDashboard(${JSON.stringify(fixture)}).catch(error => { throw error; });</script></body></html>`;
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const executablePath = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const errors = [];
let browser;
try {
	browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
	page.on('pageerror', error => errors.push(error.message));
	page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.waitForSelector('[data-card-id=tracker-1] canvas');
	// Simulate the host's type-specific/focused input rules, absent from the test double.
	await page.addStyleTag({ content: '.modal input[type="text"] { background: #ff00ff !important; } .modal input[type="text"]:focus { background: #00ffff !important; }' });
	const fieldAudit = await page.evaluate(() => {
		const root = document.querySelector('.reman-workspace-root'), originalTheme = root.dataset.theme;
		const originalBodyClass = document.body.className, originalStyle = document.body.getAttribute('style');
		const modes = ['light', 'dark'];
		let checked = 0;
		const errors = [];
		for (const mode of modes) {
			const theme = 'default';
			document.body.className = `theme-${mode}`; root.dataset.theme = theme;
			document.body.style.setProperty('--background-primary', mode === 'dark' ? '#202020' : '#ffffff');
			document.body.style.setProperty('--background-secondary', mode === 'dark' ? '#292929' : '#f4f4f4');
			document.body.style.setProperty('--text-normal', mode === 'dark' ? '#eeeeee' : '#252525');
			const banner = new window.core.BannerEditModal(dashboard.app, dashboard.view.sync.getData().banner, () => {}); banner.open();
			const fields = [...banner.contentEl.querySelectorAll('input[type=text], textarea')];
			const background = getComputedStyle(fields[0]).backgroundColor;
			for (const field of fields) {
				if (getComputedStyle(field).borderRadius !== '2px') errors.push(`${mode}/${theme}: field radius mismatch`);
				field.value = 'Typed value'; field.focus();
				if (getComputedStyle(field).backgroundColor !== background) errors.push(`${mode}/${theme}: focused background mismatch`);
				field.blur();
				if (getComputedStyle(field).backgroundColor !== background) errors.push(`${mode}/${theme}: background mismatch`);
			}
			for (const wrapper of banner.contentEl.querySelectorAll('.dashboard-modal-field')) {
				const label = wrapper.querySelector(':scope > label'), control = wrapper.querySelector(':scope > input, :scope > textarea');
				if (!label?.htmlFor || label.htmlFor !== control?.id) errors.push(`${mode}/${theme}: label association missing`);
			}
			if ([...banner.contentEl.querySelectorAll('input[type=text], textarea')].some(field => !field.placeholder)) errors.push(`${mode}/${theme}: placeholder missing`);
			if (background === 'rgb(255, 0, 255)' || background === 'rgb(0, 255, 255)') errors.push(`${mode}/${theme}: host background leaked`);
			for (const field of banner.contentEl.querySelectorAll('textarea')) {
				field.style.height = '1px';
				const style = getComputedStyle(field);
				const expected = parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
				if (Math.abs(field.getBoundingClientRect().height - expected) > 1) errors.push(`${mode}/${theme}: minimum height is not one line`);
			}
			banner.close();
			const settings = new window.core.TodoSourceConfigModal(dashboard.app, undefined, () => {}); settings.open();
			for (const field of settings.contentEl.querySelectorAll('input[type=text]')) {
				field.focus(); if (getComputedStyle(field).backgroundColor !== background) errors.push(`${mode}/${theme}: Setting text background mismatch`);
			}
			settings.close();
			const library = new window.core.LibraryConfigModal(dashboard.app, { filters: [], viewMode: 'grid', sortBy: 'name', sortDesc: false }, () => {}); library.open();
			for (const field of library.contentEl.querySelectorAll('select')) if (getComputedStyle(field).backgroundColor !== background) errors.push(`${mode}/${theme}: select background mismatch`);
			library.close(); checked++;
		}
		root.dataset.theme = originalTheme; document.body.className = originalBodyClass;
		if (originalStyle === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', originalStyle);
		return { checked, errors };
	});
	assert.equal(fieldAudit.checked, 2); assert.deepEqual(fieldAudit.errors, []);
	const foregroundAudit = await page.evaluate(() => {
		const originalBodyClass = document.body.className;
		const dashboardRoot = document.querySelector('.reman-workspace-root');
		const originalRootStyle = dashboardRoot.getAttribute('style');
		const selectors = [
			'.dashboard-banner-author',
			'.dashboard-banner-edit-btn',
			'.dashboard-qa-icon',
			'.dashboard-card-body',
			'.dashboard-sidebar-week-date',
		];
		const palettes = {
			light: { primary: '#ffffff', secondary: '#f4f4f4', hover: '#e7e7ee', border: '#dddddd', normal: '#252525', muted: '#666666', faint: '#999999', accent: '#6366f1', textAccent: '#514acb' },
			dark: { primary: '#202020', secondary: '#292929', hover: '#343434', border: '#474747', normal: '#eeeeee', muted: '#aaaaaa', faint: '#777777', accent: '#8b83ff', textAccent: '#a9a4ff' },
		};
		const result = {};
		for (const [mode, palette] of Object.entries(palettes)) {
			document.body.className = `theme-${mode}`;
			for (const [name, value] of Object.entries({
				'--background-primary': palette.primary,
				'--background-secondary': palette.secondary,
				'--background-modifier-hover': palette.hover,
				'--background-modifier-border': palette.border,
				'--text-normal': palette.normal,
				'--text-muted': palette.muted,
				'--text-faint': palette.faint,
				'--text-accent': palette.textAccent,
				'--interactive-accent': palette.accent,
				'--db-text': palette.normal,
				'--db-text-muted': palette.muted,
				'--db-text-faint': palette.faint,
				'--db-banner-text': palette.normal,
				'--db-banner-text-muted': palette.muted,
				'--db-accent': palette.accent,
			})) dashboardRoot.style.setProperty(name, value);
			result[mode] = selectors.map(selector => getComputedStyle(document.querySelector(selector)).color);
		}
		document.body.className = originalBodyClass;
		if (originalRootStyle === null) dashboardRoot.removeAttribute('style'); else dashboardRoot.setAttribute('style', originalRootStyle);
		return result;
	});
	const foregroundLabels = ['banner author', 'banner edit', 'quick icon', 'card text', 'week text'];
	for (let index = 0; index < foregroundAudit.light.length; index++) {
		assert.notDeepEqual(foregroundAudit.light[index], foregroundAudit.dark[index], foregroundLabels[index]);
	}
	assert.equal(foregroundAudit.light[4], 'rgb(37, 37, 37)');
	assert.equal(foregroundAudit.dark[4], 'rgb(238, 238, 238)');
	const pinButton = page.locator('.dashboard-sidebar .dashboard-qa-pin-btn');
	await pinButton.click();
	assert.deepEqual(await page.locator('.dashboard-sidebar').evaluate(sidebar => ({
		expanded: sidebar.classList.contains('dashboard-sidebar--expanded'),
		pinned: sidebar.classList.contains('dashboard-sidebar--pinned'),
		pinVisible: getComputedStyle(sidebar.querySelector('.dashboard-qa-pin-btn')).opacity !== '0',
	})), { expanded: true, pinned: false, pinVisible: true });
	await page.locator('.dashboard-kanban').click({ position: { x: 600, y: 10 } });
	assert.ok(await page.locator('.dashboard-sidebar').evaluate(sidebar => sidebar.classList.contains('dashboard-sidebar--collapsed')));
	await page.locator('.dashboard-sidebar').dispatchEvent('mousedown');
	assert.ok(await pinButton.evaluate(button => button.getBoundingClientRect().width > 0 && getComputedStyle(button).opacity !== '0'));
	await pinButton.click();
	assert.ok(await page.locator('.dashboard-sidebar').evaluate(sidebar => sidebar.classList.contains('dashboard-sidebar--pinned')));
	assert.deepEqual(await page.evaluate(() => {
		const root = document.querySelector('.reman-workspace-root');
		const rootStyle = getComputedStyle(root);
		const sectionStyle = getComputedStyle(document.querySelector('.dashboard-section-row'));
		const cardStyle = getComputedStyle(document.querySelector('.dashboard-card'));
		return {
			theme: root.dataset.theme,
			radii: ['--db-radius-sm', '--db-radius-md', '--db-radius-lg'].map(name => rootStyle.getPropertyValue(name).trim()),
			section: { border: sectionStyle.borderTopWidth, background: sectionStyle.backgroundColor },
			card: {
				border: cardStyle.borderTopWidth,
				solid: cardStyle.backgroundColor !== 'rgba(0, 0, 0, 0)',
				shadowed: cardStyle.boxShadow !== 'none',
			},
		};
	}), {
		theme: 'default',
		radii: ['2px', '3px', '4px'],
		section: { border: '0px', background: 'rgba(0, 0, 0, 0)' },
		card: { border: '1px', solid: true, shadowed: true },
	});
	assert.equal(await page.locator('[data-card-type=weather]').count(), 0);
	assert.ok(await page.locator('[data-card-id=tracker-1] canvas').evaluate(canvas => canvas.width > 0 && canvas.height > 0));
	await page.locator('.dashboard-file-search input').fill('中文');
	assert.equal(await page.locator('.dashboard-file-search-result').count(), 2);
	await page.locator('.dashboard-file-search input').press('ArrowDown');
	await page.locator('.dashboard-file-search input').press('Enter');
	assert.equal(await page.evaluate(() => dashboard.app.opened.at(-1)), 'Plan/中文.md');
	assert.ok(await page.locator('.dashboard-quick-actions').evaluate(el => el.getBoundingClientRect().height < 250));
	const emptyMetrics = await page.evaluate(() => ({
		empty: { className: document.querySelector('[data-column="Empty"]').className, height: document.querySelector('[data-column="Empty"]').getBoundingClientRect().height },
		memo: document.querySelector('[data-column="Memo"]').getBoundingClientRect().height,
	}));
	assert.ok(emptyMetrics.empty.className.includes('dashboard-section-row--empty') && emptyMetrics.empty.height < 100);
	assert.deepEqual(await page.locator('[data-column="Tracking"] .dashboard-heatmap-item-stat-icon').evaluateAll(icons => icons.map(icon => icon.dataset.icon)), ['chart-no-axes-column-increasing', 'flame', 'circle-check']);

	// Scoped card updates keep the root and unrelated sections mounted.
	await page.evaluate(() => {
		window.scopedNodes = {
			root: document.querySelector('.reman-workspace-root'),
			memo: document.querySelector('[data-column="Memo"]'),
			todo: document.querySelector('[data-column="Todo"]'),
		};
		window.scopedWriteCount = dashboard.app.modifyCount;
	});
	const memoCount = await page.locator('[data-column="Memo"] .dashboard-card').count();
	await page.locator('[data-column="Memo"] .dashboard-section-add-btn').click();
	await page.waitForFunction(count => document.querySelectorAll('[data-column="Memo"] .dashboard-card').length === count + 1, memoCount);
	await page.waitForFunction(count => dashboard.app.modifyCount === count + 1, await page.evaluate(() => window.scopedWriteCount));
	assert.deepEqual(await page.evaluate(() => ({
		root: window.scopedNodes.root === document.querySelector('.reman-workspace-root'),
		memo: window.scopedNodes.memo === document.querySelector('[data-column="Memo"]'),
		todo: window.scopedNodes.todo === document.querySelector('[data-column="Todo"]'),
	})), { root: true, memo: false, todo: true });

	// Database controls render locally and persist once without replacing their section.
	await page.evaluate(() => {
		window.libraryNode = document.querySelector('[data-column="Database"]');
		window.libraryWriteCount = dashboard.app.modifyCount;
	});
	await page.locator('[data-column="Database"] .dashboard-library-view-btn[data-view-mode="grid"]').click();
	await page.waitForFunction(count => dashboard.app.modifyCount === count + 1, await page.evaluate(() => window.libraryWriteCount));
	await page.waitForTimeout(650);
	assert.deepEqual(await page.evaluate(() => ({
		root: window.scopedNodes.root === document.querySelector('.reman-workspace-root'),
		library: window.libraryNode === document.querySelector('[data-column="Database"]'),
		writes: dashboard.app.modifyCount - window.libraryWriteCount,
		mode: dashboard.view.sync.getData().columns.find(column => column.name === 'Database').libraryConfig.viewMode,
	})), { root: true, library: true, writes: 1, mode: 'grid' });

	await page.evaluate(async () => {
		window.externalNodes = {
			root: document.querySelector('.reman-workspace-root'),
			banner: document.querySelector('.dashboard-banner'),
			todo: document.querySelector('[data-column="Todo"]'),
			library: document.querySelector('[data-column="Database"]'),
		};
		const file = dashboard.app.files.find(item => item.path === 'Learning/中文.md');
		await dashboard.app.vault.modify(file, 'External update');
	});
	await page.waitForFunction(() => window.externalNodes.library !== document.querySelector('[data-column="Database"]'));
	assert.deepEqual(await page.evaluate(() => ({
		root: window.externalNodes.root === document.querySelector('.reman-workspace-root'),
		banner: window.externalNodes.banner === document.querySelector('.dashboard-banner'),
		todo: window.externalNodes.todo === document.querySelector('[data-column="Todo"]'),
	})), { root: true, banner: true, todo: true });

	await page.evaluate(async () => {
		window.quickNodes = {
			root: document.querySelector('.reman-workspace-root'),
			banner: document.querySelector('.dashboard-banner'),
			todo: document.querySelector('[data-column="Todo"]'),
			quick: document.querySelector('.dashboard-quick-actions'),
		};
		await dashboard.view.sync.addQuickAction({ name: 'Scoped action', icon: 'file-text', type: 'file', target: 'Plan/中文.md' });
	});
	assert.deepEqual(await page.evaluate(() => ({
		root: window.quickNodes.root === document.querySelector('.reman-workspace-root'),
		banner: window.quickNodes.banner === document.querySelector('.dashboard-banner'),
		todo: window.quickNodes.todo === document.querySelector('[data-column="Todo"]'),
		quick: window.quickNodes.quick === document.querySelector('.dashboard-quick-actions'),
	})), { root: true, banner: true, todo: true, quick: false });
	await page.evaluate(async () => {
		window.bannerNodes = {
			root: document.querySelector('.reman-workspace-root'),
			banner: document.querySelector('.dashboard-banner'),
			todo: document.querySelector('[data-column="Todo"]'),
			quick: document.querySelector('.dashboard-quick-actions'),
		};
		await dashboard.view.sync.updateBanner({ quote: 'Scoped banner update' });
	});
	assert.deepEqual(await page.evaluate(() => ({
		root: window.bannerNodes.root === document.querySelector('.reman-workspace-root'),
		banner: window.bannerNodes.banner === document.querySelector('.dashboard-banner'),
		todo: window.bannerNodes.todo === document.querySelector('[data-column="Todo"]'),
		quick: window.bannerNodes.quick === document.querySelector('.dashboard-quick-actions'),
	})), { root: true, banner: false, todo: true, quick: true });

	// Configuration stays compact by default; one searchable value list expands at a time.
	await page.locator('[data-column="Database"] .dashboard-section-add-btn').evaluate(el => el.click());
	const libraryModal = page.locator('.modal--dashboard');
	assert.equal(await libraryModal.locator('.dashboard-library-filter-config-body').count(), 0);
	const modalTopGap = await libraryModal.evaluate(el => {
		const modal = el.getBoundingClientRect(), title = el.querySelector('h2').getBoundingClientRect();
		return title.top - modal.top;
	});
	assert.ok(modalTopGap <= 24);
	await libraryModal.locator('.dashboard-library-filter-config-summary').focus();
	await page.keyboard.press('Enter');
	await libraryModal.locator('.dashboard-library-filter-config-property').selectOption('type');
	const valueList = libraryModal.locator('.dashboard-library-filter-config-values');
	assert.deepEqual(await valueList.evaluate(el => ({ maxHeight: getComputedStyle(el).maxHeight, scrolls: el.scrollHeight > el.clientHeight })), { maxHeight: '220px', scrolls: true });
	await libraryModal.locator('.dashboard-library-filter-config-search').fill('Option 39');
	assert.deepEqual(await libraryModal.locator('.dashboard-library-filter-config-value').allTextContents(), ['Option 39']);
	await libraryModal.locator('.dashboard-library-filter-config-value input').check();
	assert.match(await libraryModal.locator('.dashboard-library-filter-config-summary').textContent(), /1/);
	await page.keyboard.press('Escape');
	// Inline Todo edits, toggles and native drag events exercise the real renderer + sync.
	await page.locator('[data-card-id=todo-1] .dashboard-task-text').first().dblclick();
	const textarea = page.locator('[data-card-id=todo-1] .dashboard-task-text textarea');
	await textarea.fill('Browser edited task'); await textarea.press('Enter');
	await page.waitForFunction(() => dashboard.app.files[0].text.includes('Browser edited task'));
	await page.locator('[data-card-id=todo-1] input[type=checkbox]').first().check();
	await page.waitForFunction(() => dashboard.view.sync.getData().columns[1].cards[0].tasks.every(task => task.checked));
	await page.evaluate(() => {
		const items = document.querySelectorAll('[data-card-id=todo-1] .dashboard-task-item');
		const transfer = new DataTransfer(); items[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true }));
		items[1].dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
	});
	await page.evaluate(async () => { await dashboard.view.sync.writeQueue; });
	assert.deepEqual(await page.evaluate(() => dashboard.view.sync.getData().columns[1].cards[0].tasks.map(task => task.text)), ['Browser edited task', 'Finished']);
	assert.match(await page.locator('[data-card-id=tracker-1] canvas').evaluate(canvas => window.core.Chart.getChart(canvas).data.datasets[0].backgroundColor), /^#[0-9a-f]{8}$/i);
	await page.screenshot({ path: '.test-output/desktop.png', fullPage: true });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	await page.evaluate(() => { document.body.classList.replace('theme-light', 'theme-dark'); document.body.style.setProperty('--background-primary', '#202020'); document.body.style.setProperty('--background-secondary', '#292929'); document.body.style.setProperty('--text-normal', '#eeeeee'); });
	await page.locator('[data-column="Database"] .dashboard-library-filter-btn').click();
	const filterPopup = page.locator('.dashboard-library-filter-popup');
	assert.deepEqual(await filterPopup.evaluate(el => {
		const style = getComputedStyle(el), selectStyle = getComputedStyle(el.querySelector('select'));
		return { popupIsWhite: style.backgroundColor === 'rgb(255, 255, 255)', textIsDarkGray: style.color === 'rgb(51, 51, 51)', selectIsWhite: selectStyle.backgroundColor === 'rgb(255, 255, 255)' };
	}), { popupIsWhite: false, textIsDarkGray: false, selectIsWhite: false });
	await filterPopup.locator('.dashboard-library-filter-date-btn').first().click();
	assert.equal(await page.locator('.dashboard-library-calendar-popup').evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)'), false);
	await page.locator('.dashboard-library-calendar-popup .dashboard-task-reminder-popup-btns button').nth(1).evaluate(el => el.click());
	await page.mouse.click(1, 1);
	await page.locator('[data-card-id="todo-1"] .dashboard-task-reminder-btn').first().evaluate(el => el.click());
	assert.equal(await page.locator('.dashboard-task-reminder-popup').evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)'), false);
	await page.evaluate(() => {
		const popup = document.querySelector('.dashboard-task-reminder-popup');
		popup?.__reminderCleanup?.(); popup?.remove();
	});
	await page.locator('[data-column="Memo"] .dashboard-card-btn--danger').first().click({ force: true });
	assert.equal(await page.locator('.dashboard-confirm-card').evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)'), false);
	await page.locator('.dashboard-confirm-cancel').click();
	await page.evaluate(() => new window.core.BannerEditModal(dashboard.app, dashboard.view.sync.getData().banner, () => {}).open());
	const modalContent = page.locator('.modal--dashboard .modal-content');
	assert.deepEqual(await modalContent.evaluate(el => ({ border: getComputedStyle(el).borderWidth, padding: getComputedStyle(el).padding, background: getComputedStyle(el).backgroundColor })), { border: '0px', padding: '0px', background: 'rgba(0, 0, 0, 0)' });
	assert.deepEqual(await modalContent.locator('input[type="text"], textarea').evaluateAll(fields => fields.map(field => getComputedStyle(field).borderRadius)), ['2px', '2px', '2px', '2px']);
	const colorInput = modalContent.locator('.dashboard-banner-color-input');
	const colorRest = await colorInput.evaluate(el => ({ transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
	await colorInput.hover();
	const colorHover = await colorInput.evaluate(el => ({ transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
	assert.equal(colorRest.transform, 'none'); assert.equal(colorHover.transform, 'none'); assert.notEqual(colorHover.shadow, 'none');
	assert.equal(await modalContent.locator('textarea').first().evaluate(el => getComputedStyle(el).resize), 'vertical');
	assert.ok(await modalContent.locator('textarea').first().evaluate(el => { el.style.width = '1200px'; return el.getBoundingClientRect().width <= el.closest('.modal-content').getBoundingClientRect().width + 1; }));
	await page.screenshot({ path: '.test-output/banner-modal-dark.png', fullPage: true });
	await page.keyboard.press('Escape');
	await page.screenshot({ path: '.test-output/desktop-dark.png', fullPage: true });
	await page.evaluate(() => { document.body.classList.replace('theme-dark', 'theme-light'); document.body.removeAttribute('style'); });
	assert.equal(await page.locator('.dashboard-qa-add-btn').evaluate(el => getComputedStyle(el).opacity), '1');
	assert.ok(await page.locator('.dashboard-qa-btn-group').evaluate(el => el.children[0].classList.contains('dashboard-qa-add-btn') && el.children[1].classList.contains('dashboard-qa-pin-btn')));
	await page.locator('.dashboard-source-configure').click();
	await page.locator('.dashboard-source-config-group input[type=checkbox]').nth(0).check();
	await page.locator('.dashboard-source-config-group input[type=checkbox]').nth(1).check();
	await page.locator('.modal--dashboard .mod-cta').click();
	const monthly = page.locator('[data-source-kind=monthly]'), daily = page.locator('[data-source-kind=daily]');
	await monthly.locator('.dashboard-source-task').first().waitFor();
	// Host button outlines can look like borders even when border/shadow are cleared.
	const hostButtonStyle = await page.addStyleTag({ content: 'button:focus { outline: 2px solid red; }' });
	for (const card of [monthly, daily]) {
		const refresh = card.locator('.dashboard-source-refresh');
		await refresh.focus();
		assert.deepEqual(await refresh.evaluate(el => {
			const style = getComputedStyle(el);
			return { border: style.borderTopWidth, outline: style.outlineStyle, shadow: style.boxShadow, background: style.backgroundColor };
		}), { border: '0px', outline: 'none', shadow: 'none', background: 'rgba(0, 0, 0, 0)' });
	}
	await hostButtonStyle.evaluate(el => el.remove());
	assert.ok(await daily.textContent().then(text => text.includes('尚未创建')));
	assert.equal(await daily.getByText('从模板创建', { exact: true }).isDisabled(), true);
	await page.evaluate(() => { window.testBanner = document.querySelector('.dashboard-banner'); });
	await monthly.locator('.dashboard-source-task input[type=checkbox]').first().click();
	await page.waitForFunction(() => dashboard.app.files.find(file => file.path === window.core.resolveSourcePath(window.core.defaultTodoSources().monthly.pathTemplate)).text.includes('[x] [[Learning/中文|学习]]'));
	await page.evaluate(async () => {
		const config = window.core.defaultTodoSources();
		dashboard.app.commands = { commands: { [config.daily.createCommandId]: {} }, executeCommandById: () => { void dashboard.app.vault.create(window.core.resolveSourcePath(config.daily.pathTemplate), '## 今日待办\n- [/] Today task\n## 明日待办\n- [ ] Tomorrow task\n'); return true; } };
	});
	await daily.locator('.dashboard-source-refresh').click();
	await daily.getByText('从模板创建', { exact: true }).click();
	await daily.locator('.dashboard-source-task').waitFor();
	assert.ok(!(await daily.textContent()).includes('Tomorrow task'));
	assert.ok(await page.evaluate(() => window.testBanner === document.querySelector('.dashboard-banner')));
	await page.waitForFunction(() => document.querySelectorAll('[data-source-kind=monthly] .dashboard-source-task[data-state="x"]').length === 1);
	assert.deepEqual(await monthly.locator('.dashboard-source-task').evaluateAll(rows => rows.map(row => row.dataset.state)), [' ', 'x']);
	assert.equal(await page.locator('.dashboard-source-show-finished').count(), 0);
	assert.deepEqual(await page.evaluate(async () => {
		const before = {
			root: document.querySelector('.reman-workspace-root'),
			monthly: document.querySelector('[data-source-kind="monthly"]'),
			daily: document.querySelector('[data-source-kind="daily"]'),
			listeners: dashboard.app.vault.count(),
		};
		await dashboard.view.refresh();
		return {
			rootReplaced: before.root !== document.querySelector('.reman-workspace-root'),
			monthlyPreserved: before.monthly === document.querySelector('[data-source-kind="monthly"]'),
			dailyPreserved: before.daily === document.querySelector('[data-source-kind="daily"]'),
			listenersStable: before.listeners === dashboard.app.vault.count(),
		};
	}), { rootReplaced: true, monthlyPreserved: true, dailyPreserved: true, listenersStable: true });
	const cardMetrics = () => page.evaluate(() => {
		const sample = el => { const style = getComputedStyle(el), rect = el.getBoundingClientRect(); return { width: rect.width, height: rect.height, font: style.fontSize }; };
		const regular = document.querySelector('[data-card-id="todo-1"]');
		return { regular: sample(regular), sources: [...document.querySelectorAll('.dashboard-source-card')].map(sample),
			regularText: getComputedStyle(regular.querySelector('.dashboard-task-text')).fontSize,
			sourceText: getComputedStyle(document.querySelector('.dashboard-source-task-text')).fontSize };
	});
	let metrics = await cardMetrics();
	for (const source of metrics.sources) assert.deepEqual(source, metrics.regular);
	assert.equal(metrics.sourceText, metrics.regularText);
	await page.screenshot({ path: '.test-output/plan-sources-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	metrics = await cardMetrics();
	for (const source of metrics.sources) assert.deepEqual(source, metrics.regular);
	await page.locator('.dashboard-mobile-action-btn').first().click();
	await page.locator('.dashboard-mobile-drawer-content .dashboard-file-search input').fill('LearningBase');
	assert.equal(await page.locator('.dashboard-mobile-drawer-content .dashboard-file-search-result').count(), 1);
	await page.waitForFunction(() => Math.abs(document.querySelector('.dashboard-mobile-drawer-content').getBoundingClientRect().left) < 1);
	await page.screenshot({ path: '.test-output/mobile.png', fullPage: true });
	await page.locator('.dashboard-mobile-drawer-content .dashboard-file-search-result').tap();
	assert.equal(await page.evaluate(() => dashboard.app.opened.at(-1)), 'Learning/LearningBase.base');
	await page.locator('.dashboard-mobile-drawer-backdrop').click();
	await page.locator('.dashboard-source-configure').click();
	assert.ok(await page.locator('.modal--dashboard').evaluate(el => el.getBoundingClientRect().width <= innerWidth));
	assert.equal(await page.locator('.modal--dashboard h2').textContent(), '计划卡片配置');
	assert.equal(await page.locator('.modal--dashboard .modal-content > p').count(), 0);
	await page.screenshot({ path: '.test-output/source-config-mobile.png', fullPage: true });
	await page.keyboard.press('Escape');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	await page.evaluate(async () => { await dashboard.view.onClose(); dashboard.view.containerEl.remove(); });
	assert.equal(await page.evaluate(() => dashboard.app.vault.count()), 0);
	assert.equal(await page.evaluate(() => Object.keys(window.core.Chart.instances).length), 0);
	assert.deepEqual(errors, []);
	console.log('PASS real Chrome: desktop/mobile layout, search, Todo edits/toggle/drag, Chart.js canvas, close cleanup');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
