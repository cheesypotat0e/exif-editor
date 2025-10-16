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
  initialValue?: string; // ISO datetime string or custom format
  onChange?: (value: DateTimeValue | null) => void;
  onValidationError?: (errors: string[]) => void;
  format?: 'iso' | 'exif'; // 'iso' for ISO 8601, 'exif' for YYYY:MM:DD HH:MM:SS
  showSeconds?: boolean;
  minYear?: number;
  maxYear?: number;
}

export class CustomDateTimePicker {
  private container: HTMLElement;
  private options: DateTimePickerOptions;
  private inputs: {
    year: HTMLInputElement;
    month: HTMLInputElement;
    day: HTMLInputElement;
    hour: HTMLInputElement;
    minute: HTMLInputElement;
    second: HTMLInputElement;
  };
  private wrapper: HTMLDivElement;

  constructor(options: DateTimePickerOptions) {
    this.options = {
      showSeconds: true,
      minYear: 1900,
      maxYear: 2100,
      format: 'iso',
      ...options
    };
    this.container = options.container;
    this.inputs = {} as any;
    this.wrapper = document.createElement('div');
    
    this.init();
  }

  private init(): void {
    this.createHTML();
    this.attachEventListeners();
    
    if (this.options.initialValue) {
      this.setValueFromString(this.options.initialValue);
    }
  }

  private createHTML(): void {
    this.wrapper.className = 'custom-datetime-picker';
    
    // Create input structure
    const dateGroup = document.createElement('div');
    dateGroup.className = 'datetime-group date-group';
    
    const timeGroup = document.createElement('div');
    timeGroup.className = 'datetime-group time-group';

    // Date inputs
    this.inputs.year = this.createInput('year', 'number', '2024', 4);
    this.inputs.month = this.createInput('month', 'number', '01', 2);
    this.inputs.day = this.createInput('day', 'number', '01', 2);

    // Time inputs
    this.inputs.hour = this.createInput('hour', 'number', '00', 2);
    this.inputs.minute = this.createInput('minute', 'number', '00', 2);
    
    if (this.options.showSeconds) {
      this.inputs.second = this.createInput('second', 'number', '00', 2);
    }

    // Set input constraints
    this.inputs.year.min = this.options.minYear!.toString();
    this.inputs.year.max = this.options.maxYear!.toString();
    this.inputs.month.min = '1';
    this.inputs.month.max = '12';
    this.inputs.day.min = '1';
    this.inputs.day.max = '31';
    this.inputs.hour.min = '0';
    this.inputs.hour.max = '23';
    this.inputs.minute.min = '0';
    this.inputs.minute.max = '59';
    
    if (this.options.showSeconds) {
      this.inputs.second.min = '0';
      this.inputs.second.max = '59';
    }

    // Add labels and inputs to groups
    dateGroup.appendChild(this.createLabeledInput('Year', this.inputs.year));
    dateGroup.appendChild(this.createSeparator('/'));
    dateGroup.appendChild(this.createLabeledInput('Month', this.inputs.month));
    dateGroup.appendChild(this.createSeparator('/'));
    dateGroup.appendChild(this.createLabeledInput('Day', this.inputs.day));

    timeGroup.appendChild(this.createLabeledInput('Hour', this.inputs.hour));
    timeGroup.appendChild(this.createSeparator(':'));
    timeGroup.appendChild(this.createLabeledInput('Minute', this.inputs.minute));
    
    if (this.options.showSeconds) {
      timeGroup.appendChild(this.createSeparator(':'));
      timeGroup.appendChild(this.createLabeledInput('Second', this.inputs.second));
    }

    this.wrapper.appendChild(dateGroup);
    this.wrapper.appendChild(timeGroup);
    
    // Add error display
    const errorDiv = document.createElement('div');
    errorDiv.className = 'datetime-errors';
    errorDiv.style.display = 'none';
    this.wrapper.appendChild(errorDiv);

    this.container.appendChild(this.wrapper);
  }

  private createInput(name: string, type: string, placeholder: string, maxLength: number): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.className = `datetime-input datetime-${name}`;
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.dataset.field = name;
    return input;
  }

  private createLabeledInput(label: string, input: HTMLInputElement): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'input-container';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'input-label';
    
    container.appendChild(labelEl);
    container.appendChild(input);
    
    return container;
  }

  private createSeparator(text: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'datetime-separator';
    span.textContent = text;
    return span;
  }

  private attachEventListeners(): void {
    Object.values(this.inputs).forEach(input => {
      input.addEventListener('input', () => this.handleInputChange());
      input.addEventListener('blur', () => this.validateAndFormat());
    });
  }

  private handleInputChange(): void {
    const value = this.getCurrentValue();
    if (this.options.onChange) {
      this.options.onChange(value);
    }
  }

  private validateAndFormat(): void {
    const errors: string[] = [];
    
    // Validate and format each input
    Object.entries(this.inputs).forEach(([field, input]) => {
      const value = parseInt(input.value);
      
      if (isNaN(value)) {
        errors.push(`${field} must be a number`);
        return;
      }

      // Field-specific validation
      switch (field) {
        case 'year':
          if (value < this.options.minYear! || value > this.options.maxYear!) {
            errors.push(`Year must be between ${this.options.minYear} and ${this.options.maxYear}`);
          } else {
            input.value = value.toString();
          }
          break;
        case 'month':
          if (value < 1 || value > 12) {
            errors.push('Month must be between 1 and 12');
          } else {
            input.value = value.toString().padStart(2, '0');
          }
          break;
        case 'day':
          const year = parseInt(this.inputs.year.value);
          const month = parseInt(this.inputs.month.value);
          const maxDay = this.getDaysInMonth(year, month);
          if (value < 1 || value > maxDay) {
            errors.push(`Day must be between 1 and ${maxDay} for the selected month`);
          } else {
            input.value = value.toString().padStart(2, '0');
          }
          break;
        case 'hour':
          if (value < 0 || value > 23) {
            errors.push('Hour must be between 0 and 23');
          } else {
            input.value = value.toString().padStart(2, '0');
          }
          break;
        case 'minute':
        case 'second':
          if (value < 0 || value > 59) {
            errors.push(`${field} must be between 0 and 59`);
          } else {
            input.value = value.toString().padStart(2, '0');
          }
          break;
      }
    });

    this.displayErrors(errors);
    
    if (this.options.onValidationError) {
      this.options.onValidationError(errors);
    }
  }

  private getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  private displayErrors(errors: string[]): void {
    const errorDiv = this.wrapper.querySelector('.datetime-errors') as HTMLDivElement;
    
    if (errors.length > 0) {
      errorDiv.innerHTML = errors.map(error => `<div class="error">${error}</div>`).join('');
      errorDiv.style.display = 'block';
    } else {
      errorDiv.style.display = 'none';
    }
  }

  public getCurrentValue(): DateTimeValue | null {
    try {
      const year = parseInt(this.inputs.year.value);
      const month = parseInt(this.inputs.month.value);
      const day = parseInt(this.inputs.day.value);
      const hour = parseInt(this.inputs.hour.value);
      const minute = parseInt(this.inputs.minute.value);
      const second = this.options.showSeconds ? parseInt(this.inputs.second.value) : 0;

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
        return null;
      }

      if (this.options.showSeconds && isNaN(second)) {
        return null;
      }

      return { year, month, day, hour, minute, second };
    } catch {
      return null;
    }
  }

  public getValueAsString(): string | null {
    const value = this.getCurrentValue();
    if (!value) return null;

    if (this.options.format === 'exif') {
      // EXIF format: YYYY:MM:DD HH:MM:SS
      return `${value.year}:${value.month.toString().padStart(2, '0')}:${value.day.toString().padStart(2, '0')} ${value.hour.toString().padStart(2, '0')}:${value.minute.toString().padStart(2, '0')}:${value.second.toString().padStart(2, '0')}`;
    } else {
      // ISO format: YYYY-MM-DDTHH:MM:SS
      return `${value.year}-${value.month.toString().padStart(2, '0')}-${value.day.toString().padStart(2, '0')}T${value.hour.toString().padStart(2, '0')}:${value.minute.toString().padStart(2, '0')}:${value.second.toString().padStart(2, '0')}`;
    }
  }

  public setValueFromString(dateTimeString: string): void {
    let parsed: DateTimeValue | null = null;

    // Try to parse EXIF format first: YYYY:MM:DD HH:MM:SS
    const exifMatch = dateTimeString.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (exifMatch) {
      parsed = {
        year: parseInt(exifMatch[1]),
        month: parseInt(exifMatch[2]),
        day: parseInt(exifMatch[3]),
        hour: parseInt(exifMatch[4]),
        minute: parseInt(exifMatch[5]),
        second: parseInt(exifMatch[6])
      };
    } else {
      // Try to parse ISO format: YYYY-MM-DDTHH:MM:SS or similar
      const isoMatch = dateTimeString.match(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2}):(\d{2}):(\d{2})$/);
      if (isoMatch) {
        parsed = {
          year: parseInt(isoMatch[1]),
          month: parseInt(isoMatch[2]),
          day: parseInt(isoMatch[3]),
          hour: parseInt(isoMatch[4]),
          minute: parseInt(isoMatch[5]),
          second: parseInt(isoMatch[6])
        };
      } else {
        // Try Date constructor as fallback
        const date = new Date(dateTimeString);
        if (!isNaN(date.getTime())) {
          parsed = {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
            hour: date.getHours(),
            minute: date.getMinutes(),
            second: date.getSeconds()
          };
        }
      }
    }

    if (parsed) {
      this.setValue(parsed);
    }
  }

  public setValue(value: DateTimeValue): void {
    this.inputs.year.value = value.year.toString();
    this.inputs.month.value = value.month.toString().padStart(2, '0');
    this.inputs.day.value = value.day.toString().padStart(2, '0');
    this.inputs.hour.value = value.hour.toString().padStart(2, '0');
    this.inputs.minute.value = value.minute.toString().padStart(2, '0');
    
    if (this.options.showSeconds && this.inputs.second) {
      this.inputs.second.value = value.second.toString().padStart(2, '0');
    }

    this.validateAndFormat();
  }

  public clear(): void {
    Object.values(this.inputs).forEach(input => {
      input.value = '';
    });
    this.displayErrors([]);
  }

  public destroy(): void {
    this.wrapper.remove();
  }

  public isValid(): boolean {
    const value = this.getCurrentValue();
    return value !== null;
  }
}