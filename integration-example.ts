/**
 * Integration Example: How to use CustomDateTimePicker in the EXIF Editor
 * 
 * This shows how you could replace the existing datetime input fallbacks
 * with the custom datetime picker component.
 */

import { CustomDateTimePicker } from './src/custom-datetime-picker.js';

// Example of how to integrate the custom picker into the existing EXIF editor
export function createCustomDateTimeField(
  field: { label: string; name: string; type: string; value: string },
  idx: number,
  container: HTMLElement
): CustomDateTimePicker {
  
  // Create wrapper for the field
  const wrapper = document.createElement('div');
  wrapper.className = 'datetime-field-wrapper';
  
  // Add label
  const label = document.createElement('label');
  label.textContent = field.label;
  label.className = 'datetime-field-label';
  wrapper.appendChild(label);
  
  // Create picker container
  const pickerContainer = document.createElement('div');
  wrapper.appendChild(pickerContainer);
  
  // Create the custom picker (always uses EXIF format)
  const picker = new CustomDateTimePicker({
    container: pickerContainer,
    showSeconds: true,
    initialValue: field.value,
    onChange: (value) => {
      // Handle value changes - could trigger EXIF data updates
      console.log(`Field ${field.name} changed:`, value);
      
      // You could emit custom events here for the main app to handle
      const event = new CustomEvent('datetimeFieldChange', {
        detail: {
          fieldIndex: idx,
          fieldName: field.name,
          value: value,
          stringValue: picker.getValueAsString()
        }
      });
      container.dispatchEvent(event);
    },
    onValidationError: (errors) => {
      // Handle validation errors
      console.log(`Validation errors for ${field.name}:`, errors);
      
      // You could show errors in the UI
      const event = new CustomEvent('datetimeFieldError', {
        detail: {
          fieldIndex: idx,
          fieldName: field.name,
          errors: errors
        }
      });
      container.dispatchEvent(event);
    }
  });
  
  // Add hidden input to maintain compatibility with existing form processing
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.dataset.idx = idx.toString();
  hiddenInput.value = picker.getValueAsString() || '';
  wrapper.appendChild(hiddenInput);
  
  // Update hidden input when picker value changes
  // Store the original onChange callback
  const originalOnChange = picker.options.onChange;
  
  // Override the onChange callback to update hidden input and call original
  picker.options.onChange = (value) => {
    hiddenInput.value = picker.getValueAsString() || '';
    
    // Call the original onChange if it exists
    if (originalOnChange) {
      originalOnChange(value);
    }
  };
  
  container.appendChild(wrapper);
  
  return picker;
}

// Example of how to replace the existing datetime fallback logic
export function shouldUseCustomPicker(): boolean {
  // You could use this instead of NEEDS_DATETIME_FALLBACK
  // Always use custom picker for consistency across browsers
  return true;
  
  // Or use it selectively:
  // return !supportsDateTimeLocal() || isIOSWebKit();
}

// Example of converting existing EXIF field to use custom picker
export function convertExifFieldToCustomPicker(
  field: any, 
  idx: number, 
  fieldsForm: HTMLFormElement
): CustomDateTimePicker | null {
  
  if (field.type !== 'datetime' && field.type !== 'date' && field.type !== 'time') {
    return null;
  }
  
  // Remove existing input if any
  const existingRow = fieldsForm.querySelector(`[data-idx="${idx}"]`)?.closest('.row');
  if (existingRow) {
    existingRow.remove();
  }
  
  // Create new row with custom picker
  const row = document.createElement('div');
  row.className = 'row custom-datetime-row';
  
  const picker = createCustomDateTimeField(field, idx, row);
  
  fieldsForm.appendChild(row);
  
  return picker;
}

// Example CSS for integration
export const integrationCSS = `
.datetime-field-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

.datetime-field-label {
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
}

.custom-datetime-row {
  flex-direction: column;
  align-items: stretch;
}

.custom-datetime-row .custom-datetime-picker {
  margin: 0;
  border: none;
  padding: 0;
  background: transparent;
}
`;

// Usage example:
/*
// In your main EXIF editor code, instead of creating native inputs:

if (shouldUseCustomPicker()) {
  // Use custom picker
  const picker = convertExifFieldToCustomPicker(field, idx, fieldsForm);
  
  // Store reference for later use
  customPickers.set(idx, picker);
} else {
  // Fall back to native inputs (existing code)
  // ... existing input creation logic
}

// When processing form data for download:
customPickers.forEach((picker, idx) => {
  const field = parsedFields[idx];
  const stringValue = picker.getValueAsString();
  
  // Convert to appropriate format for EXIF
  if (field.type === 'datetime') {
    newVal = fromInputDateTime(stringValue);
  } else if (field.type === 'date') {
    newVal = fromInputDate(stringValue);
  } else if (field.type === 'time') {
    newVal = fromInputTime(stringValue);
  }
  
  // ... rest of existing processing logic
});
*/