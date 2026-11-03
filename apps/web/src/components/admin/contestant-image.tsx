"use client";
import { useEffect, useRef, useState } from "react";

export function ContestantImage({ id, imageUrl, name }: { id?: string; imageUrl: string | null; name: string }) {
  const [current, setCurrent] = useState(imageUrl);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<XMLHttpRequest | null>(null);
  const previewUrl = useRef<string | undefined>(undefined);
  useEffect(() => () => { active.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  function selectFile(selected?: File) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = selected ? URL.createObjectURL(selected) : undefined;
    setPreview(previewUrl.current); setFile(selected);
  }
  async function change(remove = false) {
    if (!id || busy || (!remove && !file)) return;
    setBusy(true); setError(""); setProgress(0); setStatus(remove ? "Removing photograph…" : "Uploading photograph…");
    try {
      const response = await fetch("/api/admin/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const csrf = await response.json();
      if (!response.ok || !csrf.data?.csrfToken) throw new Error("Your session could not be verified. Sign in again.");
      const result = await new Promise<{ imageUrl: string | null }>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); active.current = xhr;
        xhr.open(remove ? "DELETE" : "POST", `/api/admin/contestants/${encodeURIComponent(id!)}/image`);
        xhr.timeout = 90000; xhr.setRequestHeader("X-CSRF-Token", csrf.data.csrfToken);
        xhr.upload.onprogress = event => { if (event.lengthComputable) { setProgress(Math.floor(event.loaded * 100 / event.total)); if (event.loaded === event.total) setStatus("Processing and saving photograph…"); } };
        xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error("Image change could not be confirmed. Reload before retrying."));
        xhr.onload = () => {
          if (xhr.status === 401) { window.location.replace("/admin/login"); reject(new Error("Your session expired. Sign in again.")); return; }
          try {
            const value = JSON.parse(xhr.responseText);
            if (xhr.status < 200 || xhr.status >= 300) {
              const messages: Record<number, string> = { 400: "Choose a valid, non-animated JPG, PNG or WebP photograph.", 403: "Your request expired. Try again.", 404: "This contestant is no longer available.", 409: "The photograph changed. Reload before retrying.", 413: "Photographs must be 5 MB or smaller.", 429: "Image processing is busy. Try again shortly." };
              reject(new Error(messages[xhr.status] || "Image change could not be confirmed. Reload before retrying.")); return;
            }
            if (value.status !== "success" || !(value.data?.imageUrl === null || typeof value.data?.imageUrl === "string")) throw new Error();
            resolve(value.data);
          } catch { reject(new Error("Unexpected response. Reload before retrying.")); }
        };
        if (remove) { xhr.setRequestHeader("Content-Type", "application/json"); xhr.send("{}"); }
        else { const data = new FormData(); data.append("image", file!); xhr.send(data); }
      });
      setCurrent(result.imageUrl); selectFile(undefined); if (input.current) input.current.value = "";
      setStatus(remove ? "Photograph removed." : "Photograph saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Upload failed. Try again."); setStatus(""); }
    finally { active.current = null; setBusy(false); }
  }
  return <section className="admin-image-panel" aria-labelledby="photo-heading" aria-busy={busy}>
    <h2 id="photo-heading">Photograph</h2>
    {preview || current ? <div className="admin-image-preview">{/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview || current!} alt={`${preview ? "Selected" : "Current"} photograph of ${name || "contestant"}`} width={180} height={225} /></div> : <p className="admin-muted">No photograph yet.</p>}
    {!id ? <p>Register the contestant first, then add their photograph on the editing page.</p> : <>
      <label htmlFor="image">Choose a photograph</label>
      <input ref={input} id="image" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} aria-describedby="photo-help" onChange={event => {
        const selected = event.target.files?.[0]; setError(""); setStatus("");
        if (selected && (selected.size > 5_000_000 || !/\.(jpe?g|png|webp)$/i.test(selected.name) || !["image/jpeg", "image/png", "image/webp"].includes(selected.type))) { setError("Choose a JPG, PNG or WebP photograph, 5 MB or smaller."); selectFile(undefined); event.target.value = ""; return; }
        selectFile(selected);
      }} />
      <p id="photo-help" className="admin-field-help">JPG, PNG or WebP, up to 5 MB. Photographs are checked and optimized before publication.</p>
      <div className="admin-actions"><button className="admin-button" type="button" disabled={busy || !file} onClick={() => void change()}>{current ? "Replace photograph" : "Upload photograph"}</button>
        {current && <button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={() => void change(true)}>Remove photograph</button>}</div>
      {busy && <progress value={progress} max={100} aria-label="Photograph upload progress" />}
    </>}
    <p role="status" aria-live="polite">{status}</p>{error && <p role="alert" className="admin-error">{error}</p>}
  </section>;
}
