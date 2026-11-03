import { createClient } from "@supabase/supabase-js";
import { IMAGE_BUCKET, type StorageConfiguration } from "../config/storage";
import { HttpError } from "../http/errors";

export interface ImageStorage {
  publicUrl(key: string): string;
  upload(key: string, bytes: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
}
export const managedKey = (key: string) => /^contestants\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.webp$/.test(key);
export class SupabaseImageStorage implements ImageStorage {
  private readonly client;
  constructor(config: StorageConfiguration) {
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) }) },
    });
  }
  publicUrl(key: string) {
    if (!managedKey(key)) throw new Error("Invalid managed image key.");
    return this.client.storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl;
  }
  async upload(key: string, bytes: Buffer) {
    if (!managedKey(key)) throw new Error("Invalid managed image key.");
    try {
      const { error } = await this.client.storage.from(IMAGE_BUCKET).upload(key, bytes, { contentType: "image/webp", cacheControl: "3600", upsert: false });
      if (error) throw error;
    } catch { throw new HttpError(502, "IMAGE_STORAGE_UNAVAILABLE", "Image upload could not be confirmed. The current photo is unchanged. Try again."); }
  }
  async remove(key: string) {
    if (!managedKey(key)) throw new Error("Invalid managed image key.");
    try { const { error } = await this.client.storage.from(IMAGE_BUCKET).remove([key]); if (error) throw error; }
    catch { throw new Error("Image cleanup could not be confirmed."); }
  }
}
