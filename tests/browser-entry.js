import * as core from './entry.js';
core.installDom(window);
window.core = core;
window.startDashboard = async (fixture) => {
	core.setLanguage('zh');
	const files = [new core.TFile('Home.md', fixture), new core.TFile('Learning/中文.md', '', { tags: ['Course'], completed: 2, total: 5 }), new core.TFile('Plan/中文.md'), new core.TFile('Learning/LearningBase.base'), new core.TFile('Library/quotes.md', 'Keep it simple | Test')];
	for (let i = 0; i < 40; i++) files.push(new core.TFile(`Options/${i}.md`, '', { type: `Option ${String(i).padStart(2, '0')}` }));
	for (let i = 0; i < 7; i++) {
		const date = new Date(); date.setDate(date.getDate() - i);
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		files.push(new core.TFile(`${key}.md`, '', { date: key, fitness: i + 1 }));
	}
	files.push(new core.TFile(core.resolveSourcePath(core.defaultTodoSources().monthly.pathTemplate), '## Main Tasks\n- [/] [[Learning/中文|学习]]\n- [ ] [课程](../../Learning/Course.md)\n'));
	const app = new core.App(files); app.saveLocalStorage(core.SIDEBAR_PINNED_STORAGE_KEY, 'true');
	const plugin = { app, manifest: { id: core.PLUGIN_ID }, settings: { ...core.DEFAULT_SETTINGS, dashboardFile: 'Home', language: 'zh' }, saveSettings: async () => {} };
	const view = new core.DashboardView({ app }, plugin);
	window.dashboard = { app, plugin, view };
	await view.onOpen();
};
