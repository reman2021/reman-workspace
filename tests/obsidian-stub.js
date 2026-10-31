// Test-only Obsidian surface. Never bundled into the installable plugin.
export function installDom(window) {
	const proto = window.HTMLElement.prototype;
	proto.createEl = function (tag, options = {}, callback) {
		const el = window.document.createElement(tag);
		if (options.cls) el.className = Array.isArray(options.cls) ? options.cls.join(' ') : options.cls;
		if (options.text != null) el.textContent = String(options.text);
		for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, String(value));
		for (const key of ['type', 'href', 'title', 'value']) if (options[key] != null) el[key] = options[key];
		this.appendChild(el); callback?.(el); return el;
	};
	proto.createDiv = function (options, callback) { return this.createEl('div', typeof options === 'string' ? { cls: options } : options, callback); };
	proto.createSpan = function (options, callback) { return this.createEl('span', options, callback); };
	proto.empty = function () { this.replaceChildren(); };
	proto.addClass = function (...names) { this.classList.add(...names); };
	proto.removeClass = function (...names) { this.classList.remove(...names); };
	proto.toggleClass = function (name, enabled) { this.classList.toggle(name, enabled); };
	proto.hasClass = function (name) { return this.classList.contains(name); };
	proto.getText = function () { return this.textContent; };
	proto.setText = function (text) { this.textContent = String(text); };
	proto.setCssProps = function (props) { for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value); };
	proto.setAttr = function (key, value) { this.setAttribute(key, value); };
	proto.getAttr = function (key) { return this.getAttribute(key); };
	proto.hide = function () { this.hidden = true; };
	proto.show = function () { this.hidden = false; };
	proto.isShown = function () { return !this.hidden; };
	proto.scrollIntoView ??= function () {};
	window.document.createDiv = (...args) => window.document.body.createDiv(...args);
	window.document.createEl = (...args) => window.document.body.createEl(...args);
}

export class Events {
	listeners = new Map();
	on(name, callback) { const ref = { name, callback, owner: this }; const group = this.listeners.get(name) ?? new Set(); group.add(ref); this.listeners.set(name, group); return ref; }
	offref(ref) { this.listeners.get(ref.name)?.delete(ref); }
	trigger(name, ...args) { for (const ref of this.listeners.get(name) ?? []) ref.callback(...args); }
	count() { return [...this.listeners.values()].reduce((count, set) => count + set.size, 0); }
}
export class TAbstractFile {}
export class TFile extends TAbstractFile {
	constructor(path, text = '', frontmatter = {}) { super(); this.path = path; this.text = text; this.frontmatter = frontmatter; this.stat = { mtime: Date.now(), ctime: Date.now() }; }
	get name() { return this.path.split('/').pop(); }
	get extension() { return this.name.split('.').pop(); }
	get basename() { return this.name.replace(/\.[^.]+$/, ''); }
}
export class App {
	constructor(files = []) {
		this.files = files; this.storage = new Map(); this.opened = []; this.backups = new Map(); this.modifyCount = 0;
		const events = new Events();
		this.vault = Object.assign(events, {
			configDir: '.obsidian', getFiles: () => this.files, getMarkdownFiles: () => this.files.filter(file => file.extension === 'md'),
			getFileByPath: path => this.files.find(file => file.path === path) ?? null,
			getAbstractFileByPath: path => this.files.find(file => file.path === path) ?? null,
			read: async file => file.text, cachedRead: async file => file.text,
			modify: async (file, text) => { this.modifyCount++; file.text = text; events.trigger('modify', file); },
			process: async (file, fn) => { const result = fn(file.text); file.text = result; events.trigger('modify', file); return result; },
			create: async (path, text) => { const file = new TFile(path, text); this.files.push(file); events.trigger('create', file); return file; },
			createFolder: async () => {}, getResourcePath: file => `app://local/${file.path}`,
			adapter: { exists: async path => this.backups.has(path), read: async path => this.backups.get(path), mkdir: async path => this.backups.set(path, ''),
				write: async (path, text) => this.backups.set(path, text), remove: async path => this.backups.delete(path),
				list: async () => ({ files: [...this.backups.keys()].filter(path => path.endsWith('.md')), folders: [] }) },
		});
		this.metadataCache = Object.assign(new Events(), { getFileCache: file => ({ frontmatter: file.frontmatter }), getFirstLinkpathDest: path => this.files.find(file => file.path === path || file.basename === path) });
		this.workspace = Object.assign(new Events(), {
			getLeaf: () => ({ openFile: async file => this.opened.push(file.path) }), getLeavesOfType: () => [],
			openLinkText: async path => this.opened.push(path), setActiveLeaf() {},
		});
	}
	loadLocalStorage(key) { return this.storage.get(key); }
	saveLocalStorage(key, value) { this.storage.set(key, value); }
}
export class Component {
 children = []; cleanups = []; loaded = false;
 load() { if (this.loaded) return; this.loaded = true; this.children.forEach(child => child.load()); this.onload?.(); }
 unload() { if (!this.loaded) return; this.loaded = false; this.onunload?.(); this.children.forEach(child => child.unload()); this.cleanups.splice(0).forEach(fn => fn()); }
 addChild(child) { this.children.push(child); if (this.loaded) child.load(); return child; }
 removeChild(child) { child.unload(); this.children = this.children.filter(item => item !== child); return child; }
 register(fn) { this.cleanups.push(fn); }
 registerEvent(ref) { this.register(() => ref.owner.offref(ref)); }
 registerInterval(id) { this.register(() => window.clearInterval(id)); }
 registerDomEvent(el, event, fn) { el.addEventListener(event, fn); this.register(() => el.removeEventListener(event, fn)); }
}
export class MarkdownRenderer {
 static async render(app, text, el, path) {
  el.dataset.sourcePath = path;
  for (const part of text.split(/(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g)) {
   const wiki = part.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/), md = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
   if (wiki || md) {
    const link = el.createEl('a', { text: wiki ? wiki[2] ?? wiki[1] : md[1], href: wiki ? wiki[1] : md[2] });
    link.addEventListener('click', event => { event.preventDefault(); app.opened.push(wiki ? wiki[1] : new URL(md[2], 'https://vault/' + path).pathname.slice(1)); });
   } else el.appendChild(document.createTextNode(part));
  }
 }
}
export class ItemView {
	constructor(leaf) { this.app = leaf.app; this.containerEl = document.body.createDiv(); this.containerEl.createDiv(); this.containerEl.createDiv(); }
}
export class WorkspaceLeaf {}
export class Notice { constructor(message) { Notice.messages.push(message); } static messages = []; }
export function setIcon(el, icon) { el.dataset.icon = icon; }
export class Modal {
	constructor(app) {
 this.app = app; this.containerEl = document.body.createDiv({ cls: 'modal-container' });
 this.containerEl.createDiv({ cls: 'modal-bg' }); this.modalEl = this.containerEl.createDiv({ cls: 'modal' });
 const close = this.modalEl.createDiv({ cls: 'modal-close-button', text: '×' }); close.addEventListener('click', () => this.close());
 this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
 this.onKeydown = event => { if (event.key === 'Escape') this.close(); };
 }
	open() { this.onOpen?.(); document.addEventListener('keydown', this.onKeydown); }
	close() { this.onClose?.(); document.removeEventListener('keydown', this.onKeydown); this.containerEl.remove(); }
}
export class Setting {
	constructor(container) { this.settingEl = container.createDiv({ cls: 'setting-item' }); this.nameEl = this.settingEl.createDiv(); }
	setName(name) { this.nameEl.textContent = name; return this; }
	setDesc() { return this; }
	control(tag, callback, type) {
		const el = this.settingEl.createEl(tag, type ? { type } : {});
		const control = { inputEl: el, selectEl: el, toggleEl: el,
			setValue(value) { if (type === 'checkbox') el.checked = value; else el.value = value; return this; },
			setPlaceholder(value) { el.placeholder = value; return this; },
			addOptions(options) { for (const [value, text] of Object.entries(options)) el.createEl('option', { text, value }); return this; },
			setButtonText(text) { el.textContent = text; return this; }, setCta() { return this; }, setIcon(icon) { el.dataset.icon = icon; return this; }, setTooltip(text) { el.title = text; return this; },
			setLimits() { return this; }, setDynamicTooltip() { return this; },
			onClick(fn) { el.addEventListener('click', fn); return this; },
			onChange(fn) { el.addEventListener('change', () => { void fn(type === 'checkbox' ? el.checked : el.value); }); return this; },
		}; callback(control); return this;
	}
	addDropdown(fn) { return this.control('select', fn); }
	addToggle(fn) { return this.control('input', fn, 'checkbox'); }
	addText(fn) { return this.control('input', fn, 'text'); }
	addButton(fn) { return this.control('button', fn); }
	addExtraButton(fn) { return this.control('button', fn); }
	addSlider(fn) { return this.control('input', fn, 'range'); }
}
export class PluginSettingTab {}
export class Plugin {}
