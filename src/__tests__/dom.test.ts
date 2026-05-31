import { fireEvent, screen } from '@testing-library/dom';

let renderFields: any;

beforeAll(async () => {
  // Set up mock DOM elements required for main.ts module evaluation side-effects
  document.body.innerHTML = `
    <div id="uploader"></div>
    <input id="fileInput" type="file" />
    <div id="imageModal"></div>
    <div id="imageModalBackdrop"></div>
    <img id="modalPreview" />
    <div id="fileList"></div>
    <div id="status"></div>
    <button id="downloadAllButton"></button>
  `;
  
  const main = await import('../main');
  renderFields = main.renderFields;
});

describe('Program Name Input and Presets Dropdown DOM Tests', () => {
  let form: HTMLFormElement;
  let mockFile: any;

  beforeEach(() => {
    form = document.createElement('form');
    document.body.appendChild(form);

    mockFile = {
      id: 'test-file-id',
      filename: 'test.jpg',
      originalFilename: 'test.jpg',
      parsedFields: [
        {
          label: 'Program name',
          name: 'Software',
          ifd: '0th',
          tag: 305,
          count: 13, // max character length is 12
          value: 'GIMP 2.10.36',
          type: 'text'
        }
      ],
      elements: undefined
    };
  });

  afterEach(() => {
    form.remove();
  });

  it('should render the Program name input and the presets dropdown', () => {
    renderFields(mockFile, form);

    const input = screen.getByLabelText('Program name') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('GIMP 2.10.36');
    expect(input.maxLength).toBe(12);

    const select = screen.getByRole('combobox', { name: 'Program name presets' }) as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.value).toBe(''); // "Presets..." placeholder should be selected
  });

  it('should update input and reset dropdown when selecting a short preset', () => {
    renderFields(mockFile, form);

    const input = screen.getByLabelText('Program name') as HTMLInputElement;
    const select = screen.getByRole('combobox', { name: 'Program name presets' }) as HTMLSelectElement;

    // Select "Google Android" (value: "Android")
    fireEvent.change(select, { target: { value: 'Android' } });

    expect(input.value).toBe('Android');
    expect(select.selectedIndex).toBe(0); // selection resets to the "Presets..." option
  });

  it('should update input and truncate value when selecting a preset that exceeds maxLength', () => {
    renderFields(mockFile, form);

    const input = screen.getByLabelText('Program name') as HTMLInputElement;
    const select = screen.getByRole('combobox', { name: 'Program name presets' }) as HTMLSelectElement;

    // Select "Adobe Photoshop" (value: "Adobe Photoshop" - 15 chars)
    // Should be truncated to maxLength = 12 characters: "Adobe Photos"
    fireEvent.change(select, { target: { value: 'Adobe Photoshop' } });

    expect(input.value).toBe('Adobe Photos');
    expect(input.value.length).toBe(12);
    expect(select.selectedIndex).toBe(0);
  });

  it('should clear the input when selecting the "Clear / Empty" preset', () => {
    renderFields(mockFile, form);

    const input = screen.getByLabelText('Program name') as HTMLInputElement;
    const select = screen.getByRole('combobox', { name: 'Program name presets' }) as HTMLSelectElement;

    // Select "Clear / Empty" (value: "")
    fireEvent.change(select, { target: { value: '' } });

    expect(input.value).toBe('');
    expect(select.selectedIndex).toBe(0);
  });

  it('should handle manual input changes on the Program name input field', () => {
    renderFields(mockFile, form);

    const input = screen.getByLabelText('Program name') as HTMLInputElement;

    fireEvent.input(input, { target: { value: 'Custom Edit' } });
    expect(input.value).toBe('Custom Edit');
  });

  it('should render and handle interaction for other input types (date, time, number, coordinate)', () => {
    // Add date, time, coordinate, and number fields to mockFile
    mockFile.parsedFields.push(
      {
        label: 'GPS Date Stamp',
        name: 'GPSDateStamp',
        ifd: 'GPS',
        tag: 29,
        count: 11,
        value: '2026:05:30',
        type: 'date'
      },
      {
        label: 'GPS Time Stamp',
        name: 'GPSTimeStamp',
        ifd: 'GPS',
        tag: 7,
        count: 3,
        value: [10, 20, 30],
        type: 'time'
      },
      {
        label: 'GPS Latitude',
        name: 'GPSLatitude',
        ifd: 'GPS',
        tag: 2,
        count: 3,
        value: 37.7749,
        type: 'coordinate'
      },
      {
        label: 'GPS Altitude (m)',
        name: 'GPSAltitude',
        ifd: 'GPS',
        tag: 6,
        count: 1,
        value: 123.4,
        type: 'number'
      }
    );

    renderFields(mockFile, form);

    // 1. Verify rendering of the inputs using `screen`
    const dateInput = screen.getByLabelText('GPS Date Stamp') as HTMLInputElement;
    expect(dateInput).toBeDefined();
    expect(dateInput.type).toBe('date');

    const timeInput = screen.getByLabelText('GPS Time Stamp') as HTMLInputElement;
    expect(timeInput).toBeDefined();
    expect(timeInput.type).toBe('time');

    const latInput = screen.getByLabelText('GPS Latitude') as HTMLInputElement;
    expect(latInput).toBeDefined();
    expect(latInput.type).toBe('number');

    const altInput = screen.getByLabelText('GPS Altitude (m)') as HTMLInputElement;
    expect(altInput).toBeDefined();
    expect(altInput.type).toBe('number');

    // 2. Test interaction/input event changes
    fireEvent.input(dateInput, { target: { value: '2026-06-01' } });
    expect(dateInput.value).toBe('2026-06-01');

    fireEvent.input(timeInput, { target: { value: '12:34:56' } });
    expect(timeInput.value).toBe('12:34:56');

    fireEvent.input(latInput, { target: { value: '-12.345678' } });
    expect(latInput.value).toBe('-12.345678');

    fireEvent.input(altInput, { target: { value: '-45.6' } });
    expect(altInput.value).toBe('-45.6');
  });
});
