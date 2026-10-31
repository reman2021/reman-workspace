import { Notice } from 'obsidian';

/** DOM callbacks cannot await a promise; report failures instead of losing them. */
export function handleAsync<Args extends unknown[]>(callback: (...args: Args) => Promise<unknown>): (...args: Args) => void {
	return (...args) => {
		void callback(...args).catch((error: unknown) => {
			console.error('Dashboard action failed', error);
			new Notice(error instanceof Error ? error.message : 'Dashboard action failed');
		});
	};
}
