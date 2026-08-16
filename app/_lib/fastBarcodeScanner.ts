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

const QR_FORMATS = ["qr_code"];
const LINEAR_FORMATS = ["ean_13", "ean_8", "code_128", "code_39", "codabar", "upc_a", "upc_e"];

export const FAST_BARCODE_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
  for (let i = 0; i < 40 && (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth < 2); i++) {
    await sleep(50);
  }
}

type FocusCapableTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & {
    focusMode?: string[];
    zoom?: { min: number; max: number };
  };
};

async function applyCameraTuning(stream: MediaStream) {
  const track = stream.getVideoTracks()[0] as FocusCapableTrack | undefined;
  if (!track?.getCapabilities) return;

  try {
    const caps = track.getCapabilities();
    const advanced: Record<string, unknown>[] = [];

    if (caps.focusMode?.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
    } else if (caps.focusMode?.includes("single-shot")) {
      advanced.push({ focusMode: "single-shot" });
    }

    if (caps.zoom && typeof caps.zoom.max === "number") {
      const min = caps.zoom.min ?? 1;
      const zoom = Math.min(caps.zoom.max, min + (caps.zoom.max - min) * 0.12);
      if (zoom > min) advanced.push({ zoom });
    }

    if (advanced.length > 0) {
      await track.applyConstraints({ advanced } as MediaTrackConstraints);
    }
  } catch {
    // Some browsers expose capabilities they cannot actually apply.
  }
}

function firstRawValue(detections: NativeBarcodeDetection[] | undefined) {
  return String(detections?.[0]?.rawValue ?? "").trim();
}

function grabScanFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cropCenter: boolean
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (cropCenter) {
    const crop = 0.72;
    const cw = Math.max(1, Math.floor(vw * crop));
    const ch = Math.max(1, Math.floor(vh * crop));
    canvas.width = cw;
    canvas.height = ch;
    ctx.drawImage(video, Math.floor((vw - cw) / 2), Math.floor((vh - ch) / 2), cw, ch, 0, 0, cw, ch);
    return canvas;
  }

  const scale = vw > 1280 ? 1280 / vw : 1;
  canvas.width = Math.max(1, Math.floor(vw * scale));
  canvas.height = Math.max(1, Math.floor(vh * scale));
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function streamIsLive(video: HTMLVideoElement) {
  const stream = video.srcObject as MediaStream | null;
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
}

export async function scanFastBarcode(video: HTMLVideoElement, options: FastScanOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const NativeDetector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;

  if (NativeDetector) {
    const stream = await navigator.mediaDevices.getUserMedia(FAST_BARCODE_CONSTRAINTS);
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();
    options.onReady?.();
    await waitForVideoReady(video);
    await applyCameraTuning(stream);

    const qrDetector = new NativeDetector({ formats: QR_FORMATS });
    let linearDetector: NativeBarcodeDetector | null = null;
    try {
      linearDetector = new NativeDetector({ formats: LINEAR_FORMATS });
    } catch {
      linearDetector = null;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Canvas non disponibile per la scansione");
    }
    const startedAt = Date.now();
    let frame = 0;

    while (Date.now() - startedAt < timeoutMs) {
      if (!streamIsLive(video)) {
        throw new Error("Scansione interrotta");
      }
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth < 2) {
        await nextFrame();
        continue;
      }

      const source = grabScanFrame(video, canvas, ctx, frame % 2 === 0);

      try {
        const found = firstRawValue(await qrDetector.detect(source));
        if (found) return found;
      } catch {}

      if (linearDetector && frame % 3 === 0) {
        try {
          const found = firstRawValue(await linearDetector.detect(source));
          if (found) return found;
        } catch {}
      }

      frame += 1;
      await nextFrame();
    }

    throw new Error("Timeout: nessun Barcode/QR rilevato entro 30 secondi");
  }

  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODABAR,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, false);

  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 50 });
  options.onReady?.();

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let stopScan: (() => void) | null = null;

    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        stopScan?.();
      } catch {}
      if (text) resolve(text);
      else reject(error ?? new Error("Errore camera/scansione"));
    };

    const timer = window.setTimeout(() => {
      finish(new Error("Timeout: nessun Barcode/QR rilevato entro 30 secondi"));
    }, timeoutMs);

    void reader
      .decodeFromConstraints(FAST_BARCODE_CONSTRAINTS, video, (result, _error, controls) => {
        stopScan = () => controls.stop();
        options.onReader?.({
          reset: () => controls.stop(),
          stopContinuousDecode: () => controls.stop(),
        });
        const text = String(result?.getText?.() ?? "").trim();
        if (text) finish(undefined, text);
      })
      .then((controls) => {
        stopScan = () => controls.stop();
        options.onReader?.({
          reset: () => controls.stop(),
          stopContinuousDecode: () => controls.stop(),
        });
      })
      .catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error("Errore camera/scansione"));
      });
  });
}
