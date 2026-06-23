type UploadedFile = {
  fsPath?: unknown;
  label?: unknown;
  path?: unknown;
};

const SYNTHETIC_DROP_KEY = "__codexWebUploadedDrop";
const UPLOAD_ERROR_ALERT_ID = "codex-web-drop-upload-error";

type DataTransferWithItems = {
  items?: ArrayLike<{
    webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
  }>;
};

export function needsBrowserDropUpload(
  file: File,
  getPathForFile: (file: File) => string | null,
): boolean {
  return !isImageFile(file) && getPathForFile(file) == null;
}

export function filesNeedingBrowserDropUpload(
  files: File[],
  getPathForFile: (file: File) => string | null,
): File[] {
  return files.filter((file) => needsBrowserDropUpload(file, getPathForFile));
}

export function createSyntheticUploadedFile(uploaded: UploadedFile): File | null {
  const path = typeof uploaded.fsPath === "string"
    ? uploaded.fsPath
    : typeof uploaded.path === "string"
      ? uploaded.path
      : null;
  if (!path) {
    return null;
  }

  const label =
    typeof uploaded.label === "string" && uploaded.label ? uploaded.label : path;
  const file = new File(["."], label);
  Object.defineProperties(file, {
    fsPath: { configurable: true, value: path },
    path: { configurable: true, value: path },
  });
  return file;
}

export async function uploadBrowserDropFiles(
  files: File[],
  uploadFiles: (files: File[]) => Promise<UploadedFile[]>,
  onUploadError: (error: unknown) => void = console.error,
): Promise<File[]> {
  try {
    return (await uploadFiles(files))
      .map(createSyntheticUploadedFile)
      .filter((file): file is File => file != null);
  } catch (error) {
    onUploadError(error);
    return [];
  }
}

export function hasUploadedFileForEachCandidate(
  uploadCandidates: File[],
  uploadedFiles: File[],
): boolean {
  return uploadedFiles.length === uploadCandidates.length;
}

export function showBrowserDropUploadError(
  doc: Pick<Document, "body" | "createElement" | "getElementById"> = document,
  setTimer: typeof setTimeout = setTimeout,
): void {
  const existing = doc.getElementById(UPLOAD_ERROR_ALERT_ID);
  existing?.remove();

  const alert = doc.createElement("div");
  alert.id = UPLOAD_ERROR_ALERT_ID;
  alert.textContent = "Unable to attach file";
  alert.setAttribute("role", "alert");
  alert.setAttribute("aria-live", "assertive");
  Object.assign(alert.style, {
    background: "rgb(153 27 27)",
    borderRadius: "6px",
    bottom: "16px",
    color: "white",
    font: "13px system-ui, sans-serif",
    padding: "8px 10px",
    position: "fixed",
    right: "16px",
    zIndex: "2147483647",
  });
  doc.body.append(alert);
  setTimer(() => alert.remove(), 5_000).unref?.();
}

export function dataTransferHasDirectory(
  dataTransfer: DataTransferWithItems | null | undefined,
): boolean {
  return Array.from(dataTransfer?.items ?? []).some(
    (item) => item.webkitGetAsEntry?.()?.isDirectory === true,
  );
}

export function installBrowserFileDropUploadBridge({
  getPathForFile,
  uploadFiles,
}: {
  getPathForFile: (file: File) => string | null;
  uploadFiles: (files: File[]) => Promise<UploadedFile[]>;
}): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  const handleDrop = (event: DragEvent) => {
    if (isSyntheticDrop(event)) {
      return;
    }

    const target = event.target;
    if (dataTransferHasDirectory(event.dataTransfer)) {
      return;
    }

    const files = Array.from(event.dataTransfer?.files ?? []);
    const uploadCandidates = filesNeedingBrowserDropUpload(files, getPathForFile);
    if (
      files.length === 0 ||
      uploadCandidates.length === 0 ||
      !(target instanceof EventTarget)
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    void (async () => {
      const uploadedFiles = await uploadBrowserDropFiles(
        uploadCandidates,
        uploadFiles,
        console.error,
      );
      if (
        !hasUploadedFileForEachCandidate(uploadCandidates, uploadedFiles) ||
        typeof DataTransfer === "undefined"
      ) {
        showBrowserDropUploadError();
        return;
      }

      const uploadedQueue = [...uploadedFiles];
      const dataTransfer = new DataTransfer();
      for (const file of files) {
        dataTransfer.items.add(
          needsBrowserDropUpload(file, getPathForFile)
            ? (uploadedQueue.shift() ?? file)
            : file,
        );
      }

      const drop = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer,
      });
      Object.defineProperty(drop, SYNTHETIC_DROP_KEY, { value: true });
      target.dispatchEvent(drop);
    })();
  };

  document.addEventListener("drop", handleDrop, true);
  return () => {
    document.removeEventListener("drop", handleDrop, true);
  };
}

function isSyntheticDrop(event: DragEvent): boolean {
  return Boolean((event as unknown as Record<string, unknown>)[SYNTHETIC_DROP_KEY]);
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(file.name)
  );
}
