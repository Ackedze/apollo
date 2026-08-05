import {
  appendCacheBustingQuery,
  fetchDirect,
} from '../utils/networkFetch';
import { resolveCatalogUrl } from '../reference/referenceList';

export type ContractArtifactTransportOptions = {
  baseUrl: string;
  cacheBust: number;
};

export async function fetchRemoteContractIndexPayload(
  indexUrl: string,
  cacheBust: number,
): Promise<unknown> {
  return fetchJson(
    appendCacheBustingQuery(
      indexUrl,
      'apolloContractIndex',
      cacheBust,
    ),
  );
}

export async function fetchRemoteContractArtifactPayload(
  artifactPath: string,
  options: ContractArtifactTransportOptions,
): Promise<unknown> {
  return fetchJson(
    appendCacheBustingQuery(
      resolveRemoteContractArtifactUrl(artifactPath, options.baseUrl),
      'apolloContractArtifact',
      options.cacheBust,
    ),
  );
}

export function resolveRemoteContractArtifactUrl(
  artifactPath: string,
  baseUrl: string,
): string {
  if (/^https?:\/\//i.test(artifactPath)) {
    return artifactPath;
  }
  return resolveCatalogUrl(baseUrl, artifactPath);
}

async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse(await fetchDirect(url));
}
