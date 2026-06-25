/// <reference types="@figma/plugin-typings" />

export function appendCacheBustingQuery(
  url: string,
  key: string,
  value: string | number = Date.now(),
): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}

export async function fetchDirect(url: string): Promise<string> {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
}
