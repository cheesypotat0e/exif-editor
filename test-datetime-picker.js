// Simple test for the custom datetime picker
import { CustomDateTimePicker } from './src/custom-datetime-picker.js';

// Test the basic functionality
console.log('Testing Custom DateTime Picker...');

// Create a container
const container = document.createElement('div');
document.body.appendChild(container);

// Test 1: Basic instantiation
console.log('Test 1: Basic instantiation');
const picker = new CustomDateTimePicker({
    container: container,
    format: 'iso',
    showSeconds: true,
    onChange: (value) => {
        console.log('Value changed:', value);
    },
    onValidationError: (errors) => {
        console.log('Validation errors:', errors);
    }
});

// Test 2: Set value programmatically
console.log('Test 2: Set value programmatically');
picker.setValue({
    year: 2024,
    month: 3,
    day: 15,
    hour: 14,
    minute: 30,
    second: 45
});

const value1 = picker.getCurrentValue();
console.log('Current value:', value1);
console.log('ISO string:', picker.getValueAsString());

// Test 3: Parse different string formats
console.log('Test 3: Parse string formats');

// ISO format
picker.setValueFromString('2024-12-25T09:30:15');
console.log('After ISO parse:', picker.getCurrentValue());

// EXIF format
picker.setValueFromString('2024:12:25 09:30:15');
console.log('After EXIF parse:', picker.getCurrentValue());

// Test 4: EXIF format picker
console.log('Test 4: EXIF format picker');
const container2 = document.createElement('div');
document.body.appendChild(container2);

const exifPicker = new CustomDateTimePicker({
    container: container2,
    format: 'exif',
    showSeconds: false,
    onChange: (value) => {
        console.log('EXIF picker value:', value);
    }
});

exifPicker.setValue({
    year: 2024,
    month: 10,
    day: 16,
    hour: 12,
    minute: 0,
    second: 0
});

console.log('EXIF format string:', exifPicker.getValueAsString());

// Test 5: Validation
console.log('Test 5: Validation test');
picker.setValue({
    year: 2024,
    month: 13, // Invalid month
    day: 32,   // Invalid day
    hour: 25,  // Invalid hour
    minute: 61, // Invalid minute
    second: 61  // Invalid second
});

console.log('Is valid after invalid input:', picker.isValid());

console.log('All tests completed!');