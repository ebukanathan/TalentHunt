const unconfirmed = "Image change could not be confirmed. Reload before retrying.";

/** Allowlisted messages only: never display provider responses or credentials. */
export function imageErrorMessage(status: number, code?: unknown) {
  if (status === 503 && code === "IMAGE_STORAGE_NOT_CONFIGURED")
    return "Photograph uploads are not configured for this environment. Contact support before retrying.";
  if (status === 502 && code === "IMAGE_STORAGE_UNAVAILABLE")
    return "The storage service could not confirm the upload. Reload to check the current photograph before retrying.";
  const messages: Record<number, string> = {
    400: "Choose a valid, non-animated JPG, PNG or WebP photograph.",
    403: "Your request expired. Try again.",
    404: "This contestant is no longer available.",
    408: "The upload timed out. Reload to check the current photograph before retrying.",
    409: "The photograph changed. Reload before retrying.",
    413: "Photographs must be 5 MB or smaller.",
    429: "Image processing is busy. Try again shortly.",
  };
  return messages[status] || unconfirmed;
}
