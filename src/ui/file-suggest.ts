import type { App, TFile } from 'obsidian';
import { searchFiles } from './file-search';

/** All listeners belong to the input; removing it releases the suggestion UI. */
export function attachFileSuggest(input: HTMLInputElement | HTMLTextAreaElement, app: App): { isActive(): boolean } {
 const list = input.parentElement!.createDiv({ cls: 'dashboard-file-suggest' });
 let matches: TFile[] = [];
 let selected = 0;
 const close = () => { matches = []; list.empty(); list.hidden = true; };
 const select = (file: TFile) => {
  const pos = input.selectionStart ?? input.value.length;
  const start = input.value.lastIndexOf('[[', pos);
  if (start < 0) return;
  const suffix = input.value.slice(pos).replace(/^\]\]/, '');
  input.value = `${input.value.slice(0, start)}[[${file.path}]]${suffix}`;
  const cursor = start + file.path.length + 4;
  input.setSelectionRange(cursor, cursor); close();
  input.dispatchEvent(new Event('input', { bubbles: true }));
 };
 const highlight = () => Array.from(list.children).forEach((child, index) => child.classList.toggle('is-selected', index === selected));
 input.addEventListener('input', () => {
  close();
  const query = input.value.slice(0, input.selectionStart ?? 0).match(/\[\[([^\]\n]*)$/)?.[1];
  if (query === undefined) return;
  matches = searchFiles(app.vault.getFiles(), query); selected = 0;
  list.hidden = !matches.length;
  for (const file of matches) {
   const row = list.createDiv({ cls: 'dashboard-file-suggest-item', text: file.path });
   row.addEventListener('mousedown', event => { event.preventDefault(); select(file); });
  }
  highlight();
 });
 input.addEventListener('blur', close);
 input.addEventListener('keydown', rawEvent => {
  const event = rawEvent as KeyboardEvent;
  if (!matches.length || event.isComposing) return;
  if (['Enter', 'ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
  if (event.key === 'Escape') close();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { selected = (selected + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length; highlight(); }
  if (event.key === 'Enter') { const file = matches[selected]; if (file) select(file); }
 });
 close();
 return { isActive: () => matches.length > 0 };
}
