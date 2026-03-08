// Web NFC API - Chrome Android
// https://developer.mozilla.org/en-US/docs/Web/API/NDEFReader

interface NDEFReadingEvent extends Event {
  serialNumber: string;
}

interface NDEFReader {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: "reading", listener: (event: NDEFReadingEvent) => void): void;
  removeEventListener(type: "reading", listener: (event: NDEFReadingEvent) => void): void;
}

interface NDEFReaderConstructor {
  new (): NDEFReader;
}

declare var NDEFReader: NDEFReaderConstructor | undefined;
