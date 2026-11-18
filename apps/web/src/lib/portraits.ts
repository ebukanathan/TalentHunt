export const managedPortraitPath = "/storage/v1/object/public/contestant-images/";

// This is deployment configuration, never a hostname taken from contestant input.
export function managedPortraitOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash ||
        !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes(".") ||
        /^[\d.]+$/.test(url.hostname) || url.hostname.endsWith(".localhost")) return undefined;
    return url.origin;
  } catch { return undefined; }
}

export function portraitSource(source: string | null, configuredOrigin = process.env.NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN) {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    const origin = managedPortraitOrigin(configuredOrigin);
    const key = url.pathname.slice(managedPortraitPath.length);
    const optimized = !!origin && url.origin === origin && url.pathname.startsWith(managedPortraitPath) &&
      /^contestants\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.webp$/.test(key) && !url.search && !url.hash;
    return { src: source, optimized };
  } catch { return undefined; }
}

export const portraitSizes = {
  card: "(max-width: 370px) calc(100vw - 32px), (max-width: 700px) calc((100vw - 56px) / 2), (max-width: 1050px) calc((100vw - 104px) / 3), (max-width: 1376px) calc((100vw - 152px) / 3), 408px",
  hero: "(max-width: 700px) 68vw, 345px",
  profile: "(max-width: 700px) calc(100vw - 40px), 380px",
  thumbnail: "48px",
} as const;
