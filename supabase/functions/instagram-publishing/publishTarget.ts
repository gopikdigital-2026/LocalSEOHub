export interface PublishTarget {
  publicationId: string;
  version: number;
  captionSha256: string;
  imageSha256: string;
}

// The only publication, draft version and content the internal test may send to Instagram.
export const APPROVED_TARGET: PublishTarget = Object.freeze({
  publicationId: "875587f5-0137-4477-904c-609e8e406ad6",
  version: 3,
  captionSha256: "537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e",
  imageSha256: "6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7",
});

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const sha256Text = (text: string) => sha256Hex(new TextEncoder().encode(text));

export const isTargetPublication = (target: PublishTarget, publicationId: string) =>
  publicationId.toLowerCase() === target.publicationId.toLowerCase();

export async function captionMatches(target: PublishTarget, caption: string | null): Promise<boolean> {
  return typeof caption === "string" && (await sha256Text(caption)) === target.captionSha256;
}

export async function imageMatchesTarget(target: PublishTarget, bytes: Uint8Array): Promise<boolean> {
  return bytes.byteLength > 0 && (await sha256Hex(bytes)) === target.imageSha256;
}
