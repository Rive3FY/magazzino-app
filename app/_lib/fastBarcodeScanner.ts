type NativeBarcodeDetection = {
  rawValue?: string;
};

type NativeBarcodeDetector = {
  detect: (source: ImageBitmapSource) => Promise<NativeBarcodeDetection[]>;
};

type NativeBarcodeDetectorCtor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

export type FastBarcodeReader = {
  reset?: () => void;
  stopContinuousDecode?: () => void;
};

type FastScanOptions = {
  timeoutMs?: number;
  onReady?: () => void;
  onReader?: (reader: FastBarcodeReader) => void;
};

const BARCODE_FORMATS = ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "codabar", "upc_a", "upc_e"];

export const FAST_BARCODE_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stopFastBarcodeScan(video: HTMLVideoElement | null, reader?: FastBarcodeReader | null) {
  try {
    reader?.reset?.();
  } catch {}
  try {
    reader?.stopContinuousDecode?.();
  } catch {}
  try {
    const stream = video?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
  } catch {}
}

async function waitForVideoReady(video: HTMLVideoElement) {
  for (let i = 0; i < 30 && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA; i++) {
    await sleep(50);
  }
}

export async function scanFastBarcode(video: HTMLVideoElement, options: FastScanOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const NativeDetector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;

  if (NativeDetector) {
    const stream = await navigator.mediaDevices.getUserMedia(FAST_BARCODE_CONSTRAINTS);
    video.srcObject = stream;
    await video.play();
    options.onReady?.();
    await waitForVideoReady(video);

    const detector = new NativeDetector({ formats: BARCODE_FORMATS });
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await sleep(100);
        continue;
      }

      let detections: NativeBarcodeDetection[] = [];
      try {
        detections = await detector.detect(video);
      } catch {
        await sleep(100);
        continue;
      }

      const rawValue = String(detections?.[0]?.rawValue ?? "").trim();
      if (rawValue) return rawValue;
      await sleep(100);
    }

    throw new Error("Timeout: nessun Barcode/QR rilevato entro 30 secondi");
  }

  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  options.onReader?.(reader as unknown as FastBarcodeReader);
  options.onReady?.();
  const result = await reader.decodeOnceFromConstraints(FAST_BARCODE_CONSTRAINTS, video);
  return String(result?.getText?.() ?? "").trim();
}
