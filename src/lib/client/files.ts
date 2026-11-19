// Browser-side file handling for uploads.

export const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,text/plain";
const SERVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"]);
export const MAX_FILES = 10;
export const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Shrink a photo to at most 1600 px on its longest side, as JPEG. Phone photos
 * are often 4-12 MB; this keeps uploads fast, fits Claude's image limits, and
 * re-encoding drops EXIF metadata such as GPS location. If the browser can't
 * decode the image (e.g. HEIC outside Safari), the original file is returned.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** Why the server would refuse this file, if it would. */
export function problemWith(file: File, lang: "en" | "es"): string | undefined {
  if (!SERVER_TYPES.has(file.type)) return lang === "es" ? `${file.name}: suba una foto (JPEG, PNG), un PDF o un archivo de texto.` : `${file.name}: please add a photo (JPEG, PNG), a PDF or a text file.`;
  if (file.size > MAX_BYTES) return lang === "es" ? `${file.name} pesa más de 8 MB.` : `${file.name} is larger than 8 MB.`;
  return undefined;
}
