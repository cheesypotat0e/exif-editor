/**
 * Custom DateTime Picker Component
 *
 * A simple date-time picker using basic HTML input elements with validation.
 * Supports conversion between datetime strings and individual input values.
 * No external dependencies, works across all browsers.
 */
export interface DateTimeValue {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}
export interface DateTimePickerOptions {
    container: HTMLElement;
    initialValue?: string;
    onChange?: (value: DateTimeValue | null) => void;
    onValidationError?: (errors: string[]) => void;
    format?: 'iso' | 'exif';
    showSeconds?: boolean;
    minYear?: number;
    maxYear?: number;
}
export declare class CustomDateTimePicker {
    private container;
    private options;
    private inputs;
    private wrapper;
    constructor(options: DateTimePickerOptions);
    private init;
    private createHTML;
    private createInput;
    private createLabeledInput;
    private createSeparator;
    private attachEventListeners;
    private handleInputChange;
    private validateAndFormat;
    private getDaysInMonth;
    private displayErrors;
    getCurrentValue(): DateTimeValue | null;
    getValueAsString(): string | null;
    setValueFromString(dateTimeString: string): void;
    setValue(value: DateTimeValue): void;
    clear(): void;
    destroy(): void;
    isValid(): boolean;
}
