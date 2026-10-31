import type { App } from 'obsidian';

interface CommandRegistry {
	commands: Record<string, { name?: string }>;
	executeCommandById(id: string): boolean;
}

/** Obsidian command enumeration is not exposed by the public typings. */
export function getCommands(app: App): CommandRegistry | undefined {
	return (app as App & { commands?: CommandRegistry }).commands;
}
