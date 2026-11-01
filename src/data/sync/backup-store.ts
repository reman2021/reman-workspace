import type { App } from 'obsidian';

const MAX_BACKUPS = 5;

export async function createDashboardBackup(
	app: App,
	backupDir: string,
	currentContent: string,
): Promise<void> {
	try {
		const adapter = app.vault.adapter;
		if (!(await adapter.exists(backupDir))) {
			await adapter.mkdir(backupDir);
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		await adapter.write(`${backupDir}/dashboard-${timestamp}.md`, currentContent);

		const files = await adapter.list(backupDir);
		const backups = files.files
			.filter((file: string) => file.startsWith(`${backupDir}/dashboard-`) && file.endsWith('.md'))
			.sort();
		while (backups.length > MAX_BACKUPS) {
			await adapter.remove(backups.shift()!);
		}
	} catch {
		// A backup failure must not block the primary dashboard write.
	}
}
