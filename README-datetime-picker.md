# Custom DateTime Picker

A simple, cross-browser compatible date-time picker component built with vanilla HTML, CSS, and TypeScript. Specifically designed for EXIF metadata editing. No external dependencies required.

## Features

- ✅ **Cross-browser compatible** - Works consistently across all modern browsers
- ✅ **No external dependencies** - Pure HTML, CSS, and JavaScript
- ✅ **EXIF format support** - Always outputs EXIF format (YYYY:MM:DD HH:MM:SS)
- ✅ **Validation** - Built-in input validation with error messages
- ✅ **Customizable** - Show/hide seconds, set year ranges, custom styling
- ✅ **Accessible** - Proper labels and keyboard navigation
- ✅ **Responsive** - Works on mobile and desktop
- ✅ **TypeScript support** - Full type definitions included

## Why Use This Instead of Native Date Inputs?

Native HTML date/time inputs (`<input type="datetime-local">`) have several issues:

1. **Browser inconsistencies** - Different browsers render them differently
2. **Limited browser support** - Some browsers don't support `datetime-local`
3. **iOS Safari issues** - Poor UX and limited functionality
4. **No seconds control** - Many browsers hide or don't support seconds input
5. **Styling limitations** - Hard to customize appearance consistently

This custom picker solves these problems by using basic `<input type="number">` elements with custom validation and formatting.

## Quick Start

### 1. Include the files

```html
<link rel="stylesheet" href="src/custom-datetime-picker.css">
<script type="module" src="your-script.js"></script>
```

### 2. Create a picker

```javascript
import { CustomDateTimePicker } from './src/custom-datetime-picker.js';

const picker = new CustomDateTimePicker({
    container: document.getElementById('my-picker'),
    showSeconds: true,
    onChange: (value) => {
        console.log('Date changed:', value);
    }
});
```

### 3. Set and get values

```javascript
// Set a value programmatically
picker.setValue({
    year: 2024,
    month: 3,
    day: 15,
    hour: 14,
    minute: 30,
    second: 45
});

// Get current value
const currentValue = picker.getCurrentValue();
console.log(currentValue); // { year: 2024, month: 3, day: 15, ... }

// Get as formatted string
const exifString = picker.getValueAsString();
console.log(exifString); // "2024:03:15 14:30:45"

// Parse from string
picker.setValueFromString('2024-12-25T09:30:15');
```

## API Reference

### Constructor Options

```typescript
interface DateTimePickerOptions {
    container: HTMLElement;        // Required: DOM element to render into
    initialValue?: string;         // Optional: Initial EXIF datetime string
    onChange?: (value: DateTimeValue | null) => void;
    onValidationError?: (errors: string[]) => void;
    showSeconds?: boolean;         // Default: true
    minYear?: number;             // Default: 1900
    maxYear?: number;             // Default: 2100
}
```

### DateTimeValue Interface

```typescript
interface DateTimeValue {
    year: number;    // 4-digit year (e.g., 2024)
    month: number;   // 1-12
    day: number;     // 1-31
    hour: number;    // 0-23
    minute: number;  // 0-59
    second: number;  // 0-59
}
```

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `setValue(value: DateTimeValue)` | Set the picker value | `void` |
| `getCurrentValue()` | Get current value as object | `DateTimeValue \| null` |
| `getValueAsString()` | Get formatted string | `string \| null` |
| `setValueFromString(str: string)` | Parse and set from string | `void` |
| `clear()` | Clear all inputs | `void` |
| `isValid()` | Check if current value is valid | `boolean` |
| `destroy()` | Remove picker from DOM | `void` |

## Format Support

The picker always outputs **EXIF format**:
- **Output**: `YYYY:MM:DD HH:MM:SS` (e.g., `2024:03:15 14:30:45`)
- **Use case**: EXIF metadata, camera timestamps, image file metadata

This format is specifically designed for EXIF date/time fields in image metadata.

## String Parsing

The picker can parse various datetime string formats:

```javascript
// EXIF format (primary)
picker.setValueFromString('2024:03:15 14:30:45');

// ISO formats (fallback support)
picker.setValueFromString('2024-03-15T14:30:45');
picker.setValueFromString('2024-03-15 14:30:45');

// Other formats (uses Date constructor as fallback)
picker.setValueFromString('March 15, 2024 2:30:45 PM');
```

## Validation

The picker includes comprehensive validation:

- **Year**: Within specified min/max range
- **Month**: 1-12
- **Day**: 1-31, adjusted for month/year (handles leap years)
- **Hour**: 0-23
- **Minute/Second**: 0-59

Validation errors are displayed in the UI and reported via the `onValidationError` callback.

## Styling

The picker comes with default styling that includes:

- Clean, modern appearance
- Responsive design
- Dark mode support
- Focus states and transitions
- Error state styling

### Custom Styling

You can customize the appearance by overriding CSS classes:

```css
.custom-datetime-picker {
    /* Customize the main container */
    border-color: #your-color;
}

.datetime-input {
    /* Customize individual inputs */
    background: #your-background;
}

.datetime-errors {
    /* Customize error display */
    background: #your-error-background;
}
```

## Examples

### Basic Usage

```javascript
const picker = new CustomDateTimePicker({
    container: document.getElementById('picker'),
    onChange: (value) => {
        if (value) {
            console.log('Selected:', picker.getValueAsString());
        }
    }
});
```

### EXIF Metadata Editor

```javascript
const exifPicker = new CustomDateTimePicker({
    container: document.getElementById('exif-picker'),
    initialValue: '2024:03:15 14:30:45',
    onChange: (value) => {
        // Update EXIF metadata
        updateExifTimestamp(picker.getValueAsString());
    }
});
```

### Form Integration

```javascript
const formPicker = new CustomDateTimePicker({
    container: document.getElementById('form-picker'),
    showSeconds: false,
    onChange: (value) => {
        // Update hidden form field
        document.getElementById('datetime-field').value = 
            picker.getValueAsString();
    }
});
```

### Validation Handling

```javascript
const validatedPicker = new CustomDateTimePicker({
    container: document.getElementById('validated-picker'),
    onValidationError: (errors) => {
        const errorDiv = document.getElementById('errors');
        if (errors.length > 0) {
            errorDiv.innerHTML = errors.join('<br>');
            errorDiv.style.display = 'block';
        } else {
            errorDiv.style.display = 'none';
        }
    }
});
```

## Browser Support

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+
- ✅ iOS Safari 12+
- ✅ Android Chrome 60+

## Files

- `src/custom-datetime-picker.ts` - Main TypeScript source
- `src/custom-datetime-picker.js` - Compiled JavaScript
- `src/custom-datetime-picker.d.ts` - Type definitions
- `src/custom-datetime-picker.css` - Styles
- `demo.html` - Interactive demo
- `test.html` - Functionality tests

## Demo

Open `demo.html` in your browser to see the picker in action with various configuration options.

## License

This component is part of the EXIF Date Editor project and follows the same license terms.