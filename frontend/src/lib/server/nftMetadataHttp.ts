import { X509Certificate } from "node:crypto";
import { Resolver } from "node:dns/promises";
import http, { type ClientRequest, type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { checkServerIdentity } from "node:tls";

export const DEFAULT_NFT_METADATA_TIMEOUT_MS = 4_000;
export const MAX_NFT_METADATA_BYTES = 262_144;

const messages = {
  destination: "Metadata destination is not permitted.",
  dns: "Metadata address resolution failed.",
  http: "Metadata server returned an unsuccessful response.",
  encoding: "Compressed metadata is not supported.",
  size: "Metadata exceeds the download size limit.",
  timeout: "Metadata download timed out.",
  json: "Metadata response is not a valid JSON object.",
  network: "Metadata download failed."
} as const;

class MetadataHttpError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
  }
}

export function metadataHttpErrorMessage(error: unknown) {
  return error instanceof MetadataHttpError ? messages[error.code] : messages.network;
}

function ipv4Value(address: string) {
  return address.split(".").reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

function ipv6Value(address: string) {
  // The URL parser canonicalizes embedded dotted IPv4 into hexadecimal words.
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left, right] = normalized.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const words = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill("0"), ...end];
  return words.reduce<bigint>((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function inPrefix(value: bigint, network: bigint, prefix: number, bits: number) {
  const shift = BigInt(bits - prefix);
  return value >> shift === network >> shift;
}

// Conservative policy: includes whole special blocks, without globally reachable
// anycast exceptions. See the Lot 4 decision and the IANA special-purpose registries.
const blockedV4: readonly [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
];
const blockedV6: readonly [string, number][] = [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]
];

function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const value = ipv4Value(address);
    return !blockedV4.some(([network, prefix]) => inPrefix(value, ipv4Value(network), prefix, 32));
  }
  if (isIP(address) === 6) {
    const value = ipv6Value(address);
    const interfacePrefix = (value >> 32n) & 0xffff_ffffn;
    return inPrefix(value, ipv6Value("2000::"), 3, 128) &&
      !blockedV6.some(([network, prefix]) => inPrefix(value, ipv6Value(network), prefix, 128)) &&
      interfacePrefix !== 0x0000_5efen && interfacePrefix !== 0x0200_5efen;
  }
  return false;
}

function metadataUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new MetadataHttpError("destination");
  }
  // URL removes explicit default ports and normalizes IPv4, IDNA, and case.
  if (!["http:", "https:"].includes(url.protocol) || url.port || url.username || url.password) {
    throw new MetadataHttpError("destination");
  }
  url.hash = "";
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname.includes("%") || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new MetadataHttpError("destination");
  }
  return { url, hostname };
}

/** One bounded download. No global resolver, connection pool, proxy, or retry. */
export function fetchNftMetadataJson(input: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + DEFAULT_NFT_METADATA_TIMEOUT_MS;
    const resolver = new Resolver();
    let request: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    let chunks: Buffer[] = [];
    let size = 0;
    let finished = false;
    const timer = setTimeout(() => fail("timeout"), DEFAULT_NFT_METADATA_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      // Cancellation cannot recall DNS packets already sent. The finished flag
      // also prevents a late resolution from ever creating an HTTP connection.
      resolver.cancel();
      response?.destroy();
      request?.destroy();
      chunks = [];
    }

    function fail(code: keyof typeof messages) {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new MetadataHttpError(code));
    }

    function withinBudget() {
      if (!finished && performance.now() >= deadline) fail("timeout");
      return !finished;
    }

    async function addresses(hostname: string, family: 4 | 6) {
      try {
        const result = await (family === 4 ? resolver.resolve4(`${hostname}.`) : resolver.resolve6(`${hostname}.`));
        if (result.some((address) => isIP(address) !== family || !publicAddress(address))) {
          throw new MetadataHttpError("destination");
        }
        return result;
      } catch (error) {
        if (error instanceof MetadataHttpError) throw error;
        if ((error as NodeJS.ErrnoException)?.code === "ENODATA") return [];
        throw new MetadataHttpError("dns");
      }
    }

    function receive(incoming: IncomingMessage) {
      incoming.on("error", () => fail("network"));
      if (!withinBudget()) {
        incoming.destroy();
        return;
      }
      response = incoming;
      incoming.on("aborted", () => fail("network"));
      incoming.on("close", () => {
        if (!incoming.complete) fail("network");
      });
      if (!incoming.statusCode || incoming.statusCode < 200 || incoming.statusCode >= 300) {
        fail("http");
        return;
      }
      const encoding = incoming.headers["content-encoding"];
      if (encoding !== undefined && encoding.trim().toLowerCase() !== "identity") {
        fail("encoding");
        return;
      }
      const length = incoming.headers["content-length"];
      if (length !== undefined && Number(length) > MAX_NFT_METADATA_BYTES) {
        fail("size");
        return;
      }
      incoming.on("data", (chunk: Buffer) => {
        if (!withinBudget()) return;
        size += chunk.length;
        if (size > MAX_NFT_METADATA_BYTES) {
          fail("size");
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("end", () => {
        if (!withinBudget()) return;
        if (!incoming.complete) {
          fail("network");
          return;
        }
        let json: unknown;
        try {
          json = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
        } catch {
          fail("json");
          return;
        }
        if (!json || typeof json !== "object" || Array.isArray(json)) {
          fail("json");
          return;
        }
        if (!withinBudget()) return;
        finished = true;
        cleanup();
        resolve(json as Record<string, unknown>);
      });
    }

    void (async () => {
      const { url, hostname } = metadataUrl(input);
      let address = hostname;
      if (isIP(hostname)) {
        if (!publicAddress(hostname)) throw new MetadataHttpError("destination");
      } else {
        const [ipv4, ipv6] = await Promise.all([addresses(hostname, 4), addresses(hostname, 6)]);
        address = ipv4[0] ?? ipv6[0];
        if (!address) throw new MetadataHttpError("dns");
      }
      if (!withinBudget()) return;
      const options: https.RequestOptions = {
        hostname: address,
        family: isIP(address),
        port: url.protocol === "https:" ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        maxHeaderSize: 16_384,
        headers: { Host: url.host, Accept: "application/json", "Accept-Encoding": "identity" }
      };
      if (url.protocol === "https:") {
        options.servername = isIP(hostname) ? "" : hostname;
        options.rejectUnauthorized = true;
        options.checkServerIdentity = (_name, certificate) => {
          if (!isIP(hostname)) return checkServerIdentity(hostname, certificate);
          // Node 22.23.2 IDNA-normalizes IPv6 literals in checkServerIdentity,
          // losing the IP identity. Check IP SANs with Node's native X509 API.
          // TLS still verifies certificate trust/expiry via rejectUnauthorized.
          try {
            if (new X509Certificate(certificate.raw).checkIP(hostname)) return undefined;
          } catch {
            // An absent or invalid certificate must also fail closed.
          }
          return new MetadataHttpError("network");
        };
      }
      // Use a numeric destination, never the original DNS name. TLS still checks
      // the original identity, and Host still selects the original virtual host.
      request = (url.protocol === "https:" ? https : http).request(options, receive);
      request.on("error", () => fail("network"));
      if (!withinBudget()) {
        request.destroy();
        return;
      }
      request.end();
    })().catch((error: unknown) => fail(error instanceof MetadataHttpError ? error.code : "network"));
  });
}
