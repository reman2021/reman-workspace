import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type DashboardSettings } from './core/types';
import { DashboardSettingTab } from './app/settings';
import { DashboardView } from './app/dashboard-view';
import { setLanguage, t } from './core/i18n';
import {
	DASHBOARD_VIEW_TYPE,
	LEGACY_DASHBOARD_VIEW_TYPE,
	LEGACY_PLUGIN_ID,
} from './core/identity';

export default class DashboardPlugin extends Plugin {
	settings!: DashboardSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this, DASHBOARD_VIEW_TYPE));
		this.registerView(LEGACY_DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this, LEGACY_DASHBOARD_VIEW_TYPE));

		this.addRibbonIcon('home', t('main.openDashboard'), () => this.openDashboard());

		this.addCommand({
			id: 'open-dashboard',
			name: t('main.openDashboard'),
			callback: () => this.openDashboard(),
		});

		this.addSettingTab(new DashboardSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.openDashboardOnStartup) void this.openDashboard(true);
		});
		this.registerEvent(this.app.workspace.on('css-change', () => this.refreshAllDashboards()));
	}

	onunload(): void {
		// registerView cleanup is automatic
	}

	private async openDashboard(first = false): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0]
			?? this.app.workspace.getLeavesOfType(LEGACY_DASHBOARD_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf(first ? false : 'tab');
		await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		const current = await this.loadData() as Partial<DashboardSettings> | null;
		const legacy = current && Object.keys(current).length > 0
			? null
			: await this.loadLegacySettings();
		this.settings = {
			...DEFAULT_SETTINGS,
			...(legacy ?? {}),
			...(current ?? {}),
			// Accept the legacy field, but always use the single adaptive appearance.
			stylePreset: 'default',
		};
		setLanguage(this.settings.language);
		if (legacy) await this.saveData(this.settings);
	}

	private async loadLegacySettings(): Promise<Partial<DashboardSettings> | null> {
		const adapter = this.app.vault.adapter;
		const path = `${this.app.vault.configDir}/plugins/${LEGACY_PLUGIN_ID}/data.json`;
		try {
			if (!(await adapter.exists(path))) return null;
			const raw = await adapter.read(path);
			const parsed: unknown = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed as Partial<DashboardSettings> : null;
		} catch {
			return null;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshAllDashboards(): void {
		const leaves = [
			...this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE),
			...this.app.workspace.getLeavesOfType(LEGACY_DASHBOARD_VIEW_TYPE),
		];
		for (const leaf of leaves) {
			if (leaf.view instanceof DashboardView) {
				void leaf.view.refresh();
			}
		}
	}
}
