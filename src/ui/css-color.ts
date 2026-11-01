import { findDashboardRoot } from '../core/identity';

export function getDashboardCssColor(name: string): string {
	const root = findDashboardRoot();
	if (!root) return '';
	const value = getComputedStyle(root).getPropertyValue(name).trim();
	if (!value) return '';

	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const context = canvas.getContext('2d');
	if (!context) return value;
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);
	const pixel = context.getImageData(0, 0, 1, 1).data;
	return '#' + Array.from(pixel)
		.slice(0, 3)
		.map(channel => channel.toString(16).padStart(2, '0'))
		.join('');
}
