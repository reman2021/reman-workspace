let modalFieldSequence = 0;

interface ModalFieldOptions {
	label: string;
	placeholder?: string;
	value?: string;
	fieldClass?: string;
	inputClass?: string;
}

interface ModalInputFieldOptions extends ModalFieldOptions {
	type?: 'text' | 'search' | 'number' | 'url';
}

interface ModalTextareaFieldOptions extends ModalFieldOptions {
	rows?: number;
}

function classNames(...names: Array<string | undefined>): string {
	return names.filter(Boolean).join(' ');
}

export function createModalField(container: HTMLElement, labelText: string, fieldClass?: string): {
	field: HTMLDivElement;
	label: HTMLLabelElement;
	controlId: string;
} {
	const field = container.createDiv({ cls: classNames('dashboard-modal-field', fieldClass) });
	const label = field.createEl('label', { text: labelText });
	const controlId = `reman-modal-field-${++modalFieldSequence}`;
	label.htmlFor = controlId;
	return { field, label, controlId };
}

export function createModalInputField(container: HTMLElement, options: ModalInputFieldOptions): HTMLInputElement {
	const { field, controlId } = createModalField(container, options.label, options.fieldClass);
	const input = field.createEl('input', {
		cls: classNames('dashboard-modal-input', options.inputClass),
		attr: {
			id: controlId,
			type: options.type ?? 'text',
			...(options.placeholder ? { placeholder: options.placeholder } : {}),
		},
	});
	input.value = options.value ?? '';
	return input;
}

export function createModalTextareaField(container: HTMLElement, options: ModalTextareaFieldOptions): HTMLTextAreaElement {
	const { field, controlId } = createModalField(container, options.label, options.fieldClass);
	const textarea = field.createEl('textarea', {
		cls: classNames('dashboard-modal-input', options.inputClass),
		attr: {
			id: controlId,
			rows: String(options.rows ?? 3),
			...(options.placeholder ? { placeholder: options.placeholder } : {}),
		},
	});
	textarea.value = options.value ?? '';
	return textarea;
}
