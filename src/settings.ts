import { App, PluginSettingTab, Setting } from 'obsidian';
import type DashboardPlugin from './main';
import { DEFAULT_SETTINGS, type DashboardSettings } from './types';
import { t, setLanguage, type Language } from './i18n';

export type { DashboardSettings };

export class DashboardSettingTab extends PluginSettingTab {
	plugin: DashboardPlugin;

	constructor(app: App, plugin: DashboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName(t('settings.language'))
			.setDesc(t('settings.languageDesc'))
			.addDropdown(dropdown => dropdown
				.addOptions({
					en: t('settings.languageEn'),
					zh: t('settings.languageZh'),
				})
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					const lang = value as Language;
					this.plugin.settings = {
						...this.plugin.settings,
						language: lang,
					};
					setLanguage(lang);
					await this.plugin.saveSettings();
					this.display();
					this.plugin.refreshAllDashboards();
				}));

		const recentSetting = new Setting(containerEl)
			.setName(t('settings.recentCount') + '  ' + this.plugin.settings.recentDocCount)
			.setDesc(t('settings.recentCountDesc'))
			.addSlider(slider => slider
				.setLimits(3, 15, 1)
				.setValue(this.plugin.settings.recentDocCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						recentDocCount: value,
					};
					await this.plugin.saveSettings();
					recentSetting.nameEl.setText(t('settings.recentCount') + '  ' + value);
				}));

		new Setting(containerEl)
			.setName(t('settings.dashboardFile'))
			.setDesc(t('settings.dashboardFileDesc'))
			.addText(text => text
				.setPlaceholder('Dashboard')
				.setValue(this.plugin.settings.dashboardFile)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						dashboardFile: value.trim() || DEFAULT_SETTINGS.dashboardFile,
					};
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.dashboardTitle'))
			.setDesc(t('settings.dashboardTitleDesc'))
			.addText(text => text
				.setPlaceholder(t('main.dashboard'))
				.setValue(this.plugin.settings.dashboardTitle)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						dashboardTitle: value.trim(),
					};
					await this.plugin.saveSettings();
					this.plugin.refreshAllDashboards();
				}));

		new Setting(containerEl)
			.setName(t('settings.openDashboardOnStartup'))
			.setDesc(t('settings.openDashboardOnStartupDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openDashboardOnStartup)
				.onChange(async (value) => {
					this.plugin.settings = {
						...this.plugin.settings,
						openDashboardOnStartup: value,
					};
					await this.plugin.saveSettings();
				}));




		containerEl.createDiv({ cls: 'dashboard-settings-footer', text: "crafted by Pandora's Digital Garden" });
	}

}
