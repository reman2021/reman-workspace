import assert from 'node:assert/strict';

export async function runBannerTests(context) {
	const { test, core, fixture } = context;
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
}
