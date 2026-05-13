export function normalizeUrl(input: string, baseUrl?: string): string {
  const url = new URL(input, baseUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function sameDomain(left: string, right: string): boolean {
  return new URL(left).hostname.replace(/^www\./, "") === new URL(right).hostname.replace(/^www\./, "");
}

export function inferUrlType(url: string, contentType?: string): "html" | "pdf" | "docx" | "asset" | "external" | "unknown" {
  const pathname = new URL(url).pathname.toLowerCase();
  if (contentType?.includes("pdf") || pathname.endsWith(".pdf")) return "pdf";
  if (pathname.endsWith(".docx")) return "docx";
  if (contentType?.includes("html") || pathname.endsWith(".html") || !pathname.includes(".")) return "html";
  if (/\.(png|jpe?g|gif|svg|css|js|ico)$/i.test(pathname)) return "asset";
  return "unknown";
}

export function filenameFromUrl(url: string): string | undefined {
  const last = new URL(url).pathname.split("/").filter(Boolean).at(-1);
  return last ? decodeURIComponent(last) : undefined;
}
