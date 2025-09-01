class AsyncFileReader {
  private fileReader: FileReader;

  constructor() {
    this.fileReader = new FileReader();
  }

  async readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.fileReader.onload = () =>
        resolve(this.fileReader.result as ArrayBuffer);

      this.fileReader.onerror = () => reject(this.fileReader.error);

      this.fileReader.readAsArrayBuffer(file);
    });
  }
}

export { AsyncFileReader as FileReader };
