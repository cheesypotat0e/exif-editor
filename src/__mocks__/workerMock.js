module.exports = class WorkerMock {
  constructor() {
    throw new Error("Workers are unavailable in unit tests");
  }
};
