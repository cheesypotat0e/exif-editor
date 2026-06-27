import * as fs from 'fs';
import * as path from 'path';

let parseExifDates: any;
let applyFormToWorkingBuffer: any;

beforeAll(async () => {
  // Set up mock DOM elements required for main.ts import side-effects
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
  parseExifDates = main.parseExifDates;
  applyFormToWorkingBuffer = main.applyFormToWorkingBuffer;
});

describe('EXIF parser and applyFormToWorkingBuffer tests', () => {
  const getSampleBuffer = (filename: string): ArrayBuffer => {
    const filePath = path.join(__dirname, '../../', filename);
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  };

  describe('EXIF Parsing', () => {
    it('should correctly parse EXIF metadata and GPS coordinates from IMG_2865.JPG', () => {
      const buffer = getSampleBuffer('IMG_2865.JPG');
      const fields = parseExifDates(buffer);

      // Verify Software
      const software = fields.find((f: any) => f.name === 'Software');
      expect(software).toBeDefined();
      expect(software.value).toBe('GIMP 2.10.36');
      expect(software.type).toBe('text');

      // Verify date tags
      const modifyDate = fields.find((f: any) => f.name === 'ModifyDate');
      expect(modifyDate).toBeDefined();
      expect(modifyDate.value).toBe('2026:03:20 04:47:46');

      const dateTimeOriginal = fields.find((f: any) => f.name === 'DateTimeOriginal');
      expect(dateTimeOriginal).toBeDefined();
      expect(dateTimeOriginal.value).toBe('2026:03:20 04:43:17');

      // Verify GPS coordinates
      const latitude = fields.find((f: any) => f.name === 'GPSLatitude');
      expect(latitude).toBeDefined();
      expect(latitude.value).toBeCloseTo(32.867872);

      const longitude = fields.find((f: any) => f.name === 'GPSLongitude');
      expect(longitude).toBeDefined();
      expect(longitude.value).toBeCloseTo(-96.61863);

      const altitude = fields.find((f: any) => f.name === 'GPSAltitude');
      expect(altitude).toBeDefined();
      expect(altitude.value).toBeCloseTo(161.48);
    });

    it('should parse IMG_2619.JPG successfully (has GPS but no Software tag)', () => {
      const buffer = getSampleBuffer('IMG_2619.JPG');
      const fields = parseExifDates(buffer);

      const software = fields.find((f: any) => f.name === 'Software');
      expect(software).toBeUndefined();

      const latitude = fields.find((f: any) => f.name === 'GPSLatitude');
      expect(latitude).toBeDefined();
      expect(latitude.value).toBeCloseTo(32.867877);

      const longitude = fields.find((f: any) => f.name === 'GPSLongitude');
      expect(longitude).toBeDefined();
      expect(longitude.value).toBeCloseTo(-96.61861);
    });

    it('should throw Error when parsing IMG_0239.jpg as it has no EXIF APP1 segment', () => {
      const buffer = getSampleBuffer('IMG_0239.jpg');
      expect(() => {
        parseExifDates(buffer);
      }).toThrow('No EXIF APP1 segment found');
    });

    it('should throw "Not a JPEG" when buffer does not start with JPEG SOI marker', () => {
      const buffer = new ArrayBuffer(10);
      const view = new DataView(buffer);
      view.setUint16(0, 0x1234); // not JPEG_START
      expect(() => parseExifDates(buffer)).toThrow('Not a JPEG');
    });

    it('should throw "Invalid TIFF byte order" when TIFF header has invalid byte order', () => {
      const buffer = new ArrayBuffer(20);
      const view = new DataView(buffer);
      view.setUint16(0, 0xFFD8); // JPEG_START
      view.setUint16(2, 0xFFE1); // APP1_MARKER
      view.setUint16(4, 0x000E); // segLen = 14
      view.setUint32(6, 0x45786966); // "Exif"
      view.setUint16(10, 0x0000); // "\0\0"
      // tiffStartOffset is at 6 + 6 = 12
      view.setUint16(12, 0x1234); // Invalid TIFF byte order
      expect(() => parseExifDates(buffer)).toThrow('Invalid TIFF byte order');
    });

    it('should throw "Invalid TIFF header" when TIFF header magic number is not 42', () => {
      const buffer = new ArrayBuffer(20);
      const view = new DataView(buffer);
      view.setUint16(0, 0xFFD8); // JPEG_START
      view.setUint16(2, 0xFFE1); // APP1_MARKER
      view.setUint16(4, 0x000E); // segLen = 14
      view.setUint32(6, 0x45786966); // "Exif"
      view.setUint16(10, 0x0000); // "\0\0"
      // tiffStartOffset is at 6 + 6 = 12
      view.setUint16(12, 0x4949); // LITTLE_ENDIAN
      view.setUint16(14, 99); // Invalid TIFF header (not 42)
      expect(() => parseExifDates(buffer)).toThrow('Invalid TIFF header');
    });
  });

  describe('Editing Software Tag and applyFormToWorkingBuffer', () => {
    let mockFile: any;
    let form: HTMLFormElement;
    let softwareInput: HTMLInputElement;
    let softwareIdx: number;

    beforeEach(() => {
      const originalBuffer = getSampleBuffer('IMG_2865.JPG');
      // Create a writable copy of the buffer
      const workingBuffer = originalBuffer.slice(0);
      const parsedFields = parseExifDates(workingBuffer);

      // Create a mock form element and input for the Software tag
      form = document.createElement('form');
      
      softwareIdx = parsedFields.findIndex((f: any) => f.name === 'Software');
      expect(softwareIdx).not.toBe(-1);

      softwareInput = document.createElement('input');
      softwareInput.setAttribute('data-field-input', 'true');
      softwareInput.setAttribute('data-idx', String(softwareIdx));
      softwareInput.value = 'GIMP 2.10.36';
      form.appendChild(softwareInput);

      mockFile = {
        id: 'test-file',
        filename: 'IMG_2865.JPG',
        originalFilename: 'IMG_2865.JPG',
        workingBuffer,
        parsedFields,
        elements: {
          form
        }
      };
    });

    it('should update the Software tag to a normal shorter value', () => {
      // Edit software to 'MyEditor'
      softwareInput.value = 'MyEditor';

      applyFormToWorkingBuffer(mockFile);

      expect(mockFile.parsedFields[softwareIdx].value).toBe('MyEditor');

      // Re-parse from workingBuffer to verify updates
      const updatedFields = parseExifDates(mockFile.workingBuffer);
      const updatedSoftware = updatedFields.find((f: any) => f.name === 'Software');
      expect(updatedSoftware.value).toBe('MyEditor');
    });

    it('should clear the Software tag when given an empty string', () => {
      softwareInput.value = '';

      applyFormToWorkingBuffer(mockFile);

      expect(mockFile.parsedFields[softwareIdx].value).toBe('');

      const updatedFields = parseExifDates(mockFile.workingBuffer);
      const updatedSoftware = updatedFields.find((f: any) => f.name === 'Software');
      expect(updatedSoftware.value).toBe('');
    });

    it('should truncate the Software tag if it exceeds count - 1 capacity', () => {
      // Software field has count = 13 (so max characters is 12)
      // "A very long software name" is 26 characters
      softwareInput.value = 'A very long software name';

      applyFormToWorkingBuffer(mockFile);

      expect(mockFile.parsedFields[softwareIdx].value).toBe('A very long ');

      const updatedFields = parseExifDates(mockFile.workingBuffer);
      const updatedSoftware = updatedFields.find((f: any) => f.name === 'Software');
      // "A very long " is exactly 12 characters.
      expect(updatedSoftware.value).toBe('A very long ');
      expect(updatedSoftware.value.length).toBe(12);
    });

    it('should preserve renderable GPS and Software field values after applying the form', () => {
      const gpsDateTimeIdx = mockFile.parsedFields.findIndex(
        (f: any) => f.name === 'GPSDateTime'
      );
      expect(gpsDateTimeIdx).not.toBe(-1);

      const gpsDateTimeInput = document.createElement('input');
      gpsDateTimeInput.setAttribute('data-field-input', 'true');
      gpsDateTimeInput.setAttribute('data-idx', String(gpsDateTimeIdx));
      gpsDateTimeInput.value = '2026-05-30T11:21:31';
      form.appendChild(gpsDateTimeInput);
      softwareInput.value = 'MyEditor';

      applyFormToWorkingBuffer(mockFile);

      expect(mockFile.parsedFields[gpsDateTimeIdx].value).toBe(
        '2026:05:30 11:21:31'
      );
      expect(mockFile.parsedFields[softwareIdx].value).toBe('MyEditor');
    });

    it('should update dates (ModifyDate, DateTimeOriginal, CreateDate) via applyFormToWorkingBuffer', () => {
      // Find indices
      const modifyDateIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'ModifyDate');
      const dateTimeOriginalIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'DateTimeOriginal');
      const createDateIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'CreateDate');

      expect(modifyDateIdx).not.toBe(-1);
      expect(dateTimeOriginalIdx).not.toBe(-1);

      const modifyInput = document.createElement('input');
      modifyInput.setAttribute('data-field-input', 'true');
      modifyInput.setAttribute('data-idx', String(modifyDateIdx));
      modifyInput.value = '2026-05-30T10:20:30';
      form.appendChild(modifyInput);

      const originalInput = document.createElement('input');
      originalInput.setAttribute('data-field-input', 'true');
      originalInput.setAttribute('data-idx', String(dateTimeOriginalIdx));
      originalInput.value = '2026-05-30T11:21:31';
      form.appendChild(originalInput);

      if (createDateIdx !== -1) {
        const createInput = document.createElement('input');
        createInput.setAttribute('data-field-input', 'true');
        createInput.setAttribute('data-idx', String(createDateIdx));
        createInput.value = '2026-05-30T12:22:32';
        form.appendChild(createInput);
      }

      applyFormToWorkingBuffer(mockFile);

      // Re-parse from workingBuffer to verify updates
      const updatedFields = parseExifDates(mockFile.workingBuffer);
      const updatedModifyDate = updatedFields.find((f: any) => f.name === 'ModifyDate');
      const updatedDateTimeOriginal = updatedFields.find((f: any) => f.name === 'DateTimeOriginal');

      expect(updatedModifyDate.value).toBe('2026:05:30 10:20:30');
      expect(updatedDateTimeOriginal.value).toBe('2026:05:30 11:21:31');

      if (createDateIdx !== -1) {
        const updatedCreateDate = updatedFields.find((f: any) => f.name === 'CreateDate');
        expect(updatedCreateDate.value).toBe('2026:05:30 12:22:32');
      }
    });

    it('should update GPS coordinate fields (latitude, longitude, altitude) via applyFormToWorkingBuffer, testing negative numbers that flip refs', () => {
      const latIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'GPSLatitude');
      const lonIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'GPSLongitude');
      const altIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'GPSAltitude');

      expect(latIdx).not.toBe(-1);
      expect(lonIdx).not.toBe(-1);
      expect(altIdx).not.toBe(-1);

      const latInput = document.createElement('input');
      latInput.setAttribute('data-field-input', 'true');
      latInput.setAttribute('data-idx', String(latIdx));
      latInput.value = '-33.8688';
      form.appendChild(latInput);

      const lonInput = document.createElement('input');
      lonInput.setAttribute('data-field-input', 'true');
      lonInput.setAttribute('data-idx', String(lonIdx));
      lonInput.value = '-151.2093';
      form.appendChild(lonInput);

      const altInput = document.createElement('input');
      altInput.setAttribute('data-field-input', 'true');
      altInput.setAttribute('data-idx', String(altIdx));
      altInput.value = '-15.5';
      form.appendChild(altInput);

      applyFormToWorkingBuffer(mockFile);

      // Re-parse from workingBuffer to verify updates
      const updatedFields = parseExifDates(mockFile.workingBuffer);
      const updatedLat = updatedFields.find((f: any) => f.name === 'GPSLatitude');
      const updatedLon = updatedFields.find((f: any) => f.name === 'GPSLongitude');
      const updatedAlt = updatedFields.find((f: any) => f.name === 'GPSAltitude');

      expect(updatedLat.value).toBeCloseTo(-33.8688);
      expect(updatedLon.value).toBeCloseTo(-151.2093);
      expect(updatedAlt.value).toBeCloseTo(-15.5);

      const dv = new DataView(mockFile.workingBuffer);
      expect(dv.getUint8(updatedLat._gpsRefOffset)).toBe('S'.charCodeAt(0));
      expect(dv.getUint8(updatedLon._gpsRefOffset)).toBe('W'.charCodeAt(0));
      expect(dv.getUint8(updatedAlt._gpsAltitudeRefOffset)).toBe(1);
    });

    it('should update GPS coordinate fields to positive values and verify refs (N, E, 0)', () => {
      const latIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'GPSLatitude');
      const lonIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'GPSLongitude');
      const altIdx = mockFile.parsedFields.findIndex((f: any) => f.name === 'GPSAltitude');

      expect(latIdx).not.toBe(-1);
      expect(lonIdx).not.toBe(-1);
      expect(altIdx).not.toBe(-1);

      const latInput = document.createElement('input');
      latInput.setAttribute('data-field-input', 'true');
      latInput.setAttribute('data-idx', String(latIdx));
      latInput.value = '33.8688';
      form.appendChild(latInput);

      const lonInput = document.createElement('input');
      lonInput.setAttribute('data-field-input', 'true');
      lonInput.setAttribute('data-idx', String(lonIdx));
      lonInput.value = '151.2093';
      form.appendChild(lonInput);

      const altInput = document.createElement('input');
      altInput.setAttribute('data-field-input', 'true');
      altInput.setAttribute('data-idx', String(altIdx));
      altInput.value = '15.5';
      form.appendChild(altInput);

      applyFormToWorkingBuffer(mockFile);

      // Re-parse from workingBuffer to verify updates
      const updatedFields = parseExifDates(mockFile.workingBuffer);
      const updatedLat = updatedFields.find((f: any) => f.name === 'GPSLatitude');
      const updatedLon = updatedFields.find((f: any) => f.name === 'GPSLongitude');
      const updatedAlt = updatedFields.find((f: any) => f.name === 'GPSAltitude');

      expect(updatedLat.value).toBeCloseTo(33.8688);
      expect(updatedLon.value).toBeCloseTo(151.2093);
      expect(updatedAlt.value).toBeCloseTo(15.5);

      const dv = new DataView(mockFile.workingBuffer);
      expect(dv.getUint8(updatedLat._gpsRefOffset)).toBe('N'.charCodeAt(0));
      expect(dv.getUint8(updatedLon._gpsRefOffset)).toBe('E'.charCodeAt(0));
      expect(dv.getUint8(updatedAlt._gpsAltitudeRefOffset)).toBe(0);
    });
  });
});
