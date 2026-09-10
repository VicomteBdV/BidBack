// @vitest-environment node
import { Resolver } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import { setImmediate as immediate } from "node:timers";
import type { PeerCertificate } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNftMetadataJson, MAX_NFT_METADATA_BYTES } from "@/lib/server/nftMetadataHttp";

// Exercise Node's real ClientRequest and HTTP parser without opening sockets.
class MemorySocket extends Duplex {
  written = "";
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void) {
    this.written += chunk.toString();
    done();
  }
  setTimeout() { return this; }
  setNoDelay() { return this; }
  setKeepAlive() { return this; }
}

const sockets: MemorySocket[] = [];
const connections: https.RequestOptions[] = [];
const tick = () => new Promise<void>((resolve) => immediate(resolve));

function connect(options: https.RequestOptions) {
  connections.push(options);
  const socket = new MemorySocket();
  sockets.push(socket);
  return socket as unknown as Socket;
}

function reply(body = '{"name":"Public NFT"}', headers: Record<string, string> = {}, status = 200) {
  const fields = { Connection: "close", ...headers };
  sockets.at(-1)!.push(`HTTP/1.1 ${status} Response\r\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n${body}`);
  sockets.at(-1)!.push(null);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  sockets.length = 0;
  connections.length = 0;
  vi.spyOn(http.Agent.prototype, "createConnection").mockImplementation(connect);
  vi.spyOn(https.Agent.prototype, "createConnection").mockImplementation(connect);
  vi.spyOn(Resolver.prototype, "resolve4").mockResolvedValue(["93.184.216.34"]);
  vi.spyOn(Resolver.prototype, "resolve6").mockResolvedValue(["2606:4700:4700::1111"]);
  vi.spyOn(Resolver.prototype, "cancel").mockImplementation(() => {});
});

afterEach(() => {
  for (const socket of sockets) socket.destroy();
  vi.useRealTimers();
});

describe("bounded metadata HTTP production transport", () => {
  it.each(["http", "https"])("uses the validated IP with the original %s authority", async (protocol) => {
    const result = fetchNftMetadataJson(`${protocol}://METADATA.example:${protocol === "http" ? 80 : 443}/nft?id=1#ignored`);
    await tick();
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ host: "93.184.216.34", port: protocol === "http" ? 80 : 443, family: 4 });
    expect(sockets[0].written).toContain("GET /nft?id=1 HTTP/1.1");
    expect(sockets[0].written).toContain("Host: metadata.example\r\n");
    expect(sockets[0].written).toContain("Accept-Encoding: identity");
    expect(sockets[0].written).not.toContain("ignored");
    expect(Resolver.prototype.resolve4).toHaveBeenCalledWith("metadata.example.");
    expect(Resolver.prototype.resolve6).toHaveBeenCalledWith("metadata.example.");
    if (protocol === "https") {
      expect(connections[0]).toMatchObject({ servername: "metadata.example", rejectUnauthorized: true });
      const check = connections[0].checkServerIdentity!;
      expect(check("93.184.216.34", { subjectaltname: "DNS:metadata.example" } as PeerCertificate)).toBeUndefined();
    }
    reply();
    await expect(result).resolves.toEqual({ name: "Public NFT" });
    expect(sockets[0].destroyed).toBe(true);
  });

  it.each(["http://93.184.216.34/", "https://[2606:4700:4700::1111]/"])("accepts a public literal without DNS: %s", async (url) => {
    const result = fetchNftMetadataJson(url);
    await tick();
    expect(Resolver.prototype.resolve4).not.toHaveBeenCalled();
    expect(Resolver.prototype.resolve6).not.toHaveBeenCalled();
    if (url.startsWith("https")) {
      expect(connections[0]).toMatchObject({ host: "2606:4700:4700::1111", family: 6, servername: "", rejectUnauthorized: true });
      expect(connections[0].checkServerIdentity!("wrong", { subjectaltname: "IP Address:2606:4700:4700::1111" } as PeerCertificate)).toBeUndefined();
    }
    reply();
    await expect(result).resolves.toHaveProperty("name");
  });

  it.each([
    "http://127.1/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/",
    "http://0/", "http://10.1.2.3/", "http://169.254.169.254/", "http://172.31.255.255/",
    "http://192.168.1.1/", "http://100.127.255.255/", "http://192.0.0.9/", "http://192.0.2.1/",
    "http://192.88.99.2/", "http://198.19.255.255/", "http://198.51.100.1/", "http://203.0.113.1/",
    "http://224.0.0.1/", "http://239.255.255.255/", "http://240.0.0.1/", "http://255.255.255.255/",
    "http://[::]/", "http://[::1]/", "http://[fc00::1]/", "http://[fe80::1]/", "http://[ff02::1]/",
    "http://[::ffff:127.0.0.1]/", "http://[::ffff:93.184.216.34]/", "http://[::127.0.0.1]/",
    "http://[::ffff:0:127.0.0.1]/", "http://[64:ff9b::7f00:1]/", "http://[64:ff9b:1::1]/",
    "http://[2001::1]/", "http://[2001:1ff::1]/", "http://[2001:db8::1]/", "http://[2002:7f00:1::]/",
    "http://[3fff:fff::1]/", "http://[5f00::1]/", "http://[2606:4700::5efe:7f00:1]/",
    "http://[2606:4700::200:5efe:7f00:1]/", "http://[fe80::1%25eth0]/",
    "http://localhost/", "https://LOCALHOST./", "http://sub.localhost/",
    "https://user:password@metadata.example/", "https://user@metadata.example/",
    "http://metadata.example:443/", "https://metadata.example:80/", "https://metadata.example:8443/",
    "file:///etc/passwd", "ftp://metadata.example/", "data:application/json,{}", "not a URL"
  ])("rejects %s before DNS or connection", async (url) => {
    await expect(fetchNftMetadataJson(url)).rejects.toThrow("not permitted");
    expect(Resolver.prototype.resolve4).not.toHaveBeenCalled();
    expect(Resolver.prototype.resolve6).not.toHaveBeenCalled();
    expect(connections).toEqual([]);
  });

  it.each([
    "100.63.255.255", "100.128.0.0", "172.15.255.255", "172.32.0.0",
    "198.17.255.255", "198.20.0.0", "223.255.255.255", "2001:200::1", "3ffe:ffff::1"
  ])("does not overextend the approved blocked prefixes: %s", async (ip) => {
    const result = fetchNftMetadataJson(`http://${ip.includes(":") ? `[${ip}]` : ip}/`);
    await tick();
    expect(connections).toHaveLength(1);
    reply();
    await expect(result).resolves.toHaveProperty("name");
  });

  it.each([
    [["93.184.216.34", "127.0.0.1"], ["2606:4700:4700::1111"]],
    [["93.184.216.34"], ["2606:4700:4700::1111", "fc00::1"]],
    [["93.184.216.34"], ["::ffff:10.0.0.1"]],
    [["not-an-ip"], []]
  ])("refuses mixed or invalid DNS answers", async (ipv4, ipv6) => {
    vi.mocked(Resolver.prototype.resolve4).mockResolvedValue(ipv4);
    vi.mocked(Resolver.prototype.resolve6).mockResolvedValue(ipv6);
    await expect(fetchNftMetadataJson("https://metadata.example/")).rejects.toThrow("not permitted");
    expect(connections).toEqual([]);
  });

  it.each(["ENOTFOUND", "SERVFAIL", "ETIMEOUT"])("fails closed on a DNS %s even with a public A record", async (code) => {
    vi.mocked(Resolver.prototype.resolve6).mockRejectedValue(Object.assign(new Error("internal DNS details"), { code }));
    await expect(fetchNftMetadataJson("https://metadata.example/")).rejects.toThrow("resolution failed");
    expect(connections).toEqual([]);
  });

  it("waits for both families and uses IPv6 when A has no data", async () => {
    const aaaa = deferred<string[]>();
    vi.mocked(Resolver.prototype.resolve4).mockRejectedValue(Object.assign(new Error(), { code: "ENODATA" }));
    vi.mocked(Resolver.prototype.resolve6).mockReturnValue(aaaa.promise);
    const result = fetchNftMetadataJson("https://metadata.example/");
    await tick();
    expect(connections).toEqual([]);
    aaaa.resolve(["2606:4700:4700::1111"]);
    await tick();
    expect(connections[0]).toMatchObject({ host: "2606:4700:4700::1111", family: 6 });
    reply();
    await expect(result).resolves.toHaveProperty("name");
  });

  it("rejects an empty resolution", async () => {
    vi.mocked(Resolver.prototype.resolve4).mockResolvedValue([]);
    vi.mocked(Resolver.prototype.resolve6).mockResolvedValue([]);
    await expect(fetchNftMetadataJson("http://metadata.example/")).rejects.toThrow("resolution failed");
    expect(connections).toEqual([]);
  });

  it("never resolves the hostname again between validation and connection", async () => {
    vi.mocked(Resolver.prototype.resolve4).mockResolvedValueOnce(["93.184.216.34"]).mockResolvedValue(["127.0.0.1"]);
    const result = fetchNftMetadataJson("http://metadata.example/");
    await tick();
    expect(connections[0].host).toBe("93.184.216.34");
    expect(Resolver.prototype.resolve4).toHaveBeenCalledTimes(1);
    reply();
    await expect(result).resolves.toHaveProperty("name");
  });

  it.each([301, 302, 303, 307, 308, 404, 500])("refuses HTTP %s without following Location", async (status) => {
    const result = fetchNftMetadataJson("https://metadata.example/");
    const rejected = expect(result).rejects.toThrow("unsuccessful response");
    await tick();
    reply("", { Location: "http://127.0.0.1/private" }, status);
    await rejected;
    expect(connections).toHaveLength(1);
    expect(sockets[0].destroyed).toBe(true);
  });

  it.each(["gzip", "br", "deflate", "identity, gzip"])("refuses %s content encoding before reading the body", async (encoding) => {
    const result = fetchNftMetadataJson("http://metadata.example/");
    const rejected = expect(result).rejects.toThrow("Compressed metadata");
    await tick();
    sockets[0].push(`HTTP/1.1 200 OK\r\nContent-Encoding: ${encoding}\r\n\r\n`);
    await rejected;
    expect(sockets[0].destroyed).toBe(true);
  });

  it("accepts exactly 262144 UTF-8 bytes with identity encoding", async () => {
    const body = JSON.stringify({ x: "é".repeat((MAX_NFT_METADATA_BYTES - 8) / 2) });
    expect(Buffer.byteLength(body)).toBe(MAX_NFT_METADATA_BYTES);
    const result = fetchNftMetadataJson("http://metadata.example/");
    await tick();
    reply(body, { "Content-Encoding": "identity", "Content-Length": String(Buffer.byteLength(body)) });
    await expect(result).resolves.toHaveProperty("x");
  });

  it("counts streamed bytes with no Content-Length and destroys on overflow", async () => {
    const result = fetchNftMetadataJson("http://metadata.example/");
    const rejected = expect(result).rejects.toThrow("size limit");
    await tick();
    sockets[0].push("HTTP/1.1 200 OK\r\n\r\n");
    for (let i = 0; i < 4; i++) sockets[0].push(Buffer.alloc(65_536, 32));
    await tick();
    expect(sockets[0].destroyed).toBe(false);
    sockets[0].push(Buffer.from(" "));
    await rejected;
    expect(sockets[0].destroyed).toBe(true);
  });

  it("rejects an oversized declared length immediately", async () => {
    const result = fetchNftMetadataJson("http://metadata.example/");
    const rejected = expect(result).rejects.toThrow("size limit");
    await tick();
    sockets[0].push(`HTTP/1.1 200 OK\r\nContent-Length: ${MAX_NFT_METADATA_BYTES + 1}\r\n\r\n`);
    await rejected;
    expect(sockets[0].destroyed).toBe(true);
  });

  it.each([
    "Content-Length: 100\r\n\r\n{}",
    "Content-Length: 1\r\n\r\n{\"x\":1}",
    "Content-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n"
  ])("does not trust misleading HTTP framing", async (response) => {
    const result = fetchNftMetadataJson("http://metadata.example/");
    const rejected = expect(result).rejects.toThrow();
    await tick();
    sockets[0].push(`HTTP/1.1 200 OK\r\n${response}`);
    sockets[0].push(null);
    await rejected;
    expect(sockets[0].destroyed).toBe(true);
  });

  it.each(["not-json", "null", "[]", "1", '"text"', "true"])("rejects a non-object JSON body: %s", async (body) => {
    const result = fetchNftMetadataJson("http://metadata.example/");
    const rejected = expect(result).rejects.toThrow("valid JSON object");
    await tick();
    reply(body);
    await rejected;
  });

  it("never connects after timeout even if both DNS queries resolve later", async () => {
    vi.useFakeTimers();
    const a = deferred<string[]>();
    const aaaa = deferred<string[]>();
    vi.mocked(Resolver.prototype.resolve4).mockReturnValue(a.promise);
    vi.mocked(Resolver.prototype.resolve6).mockReturnValue(aaaa.promise);
    const result = fetchNftMetadataJson("https://metadata.example/");
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(4000);
    await rejected;
    expect(Resolver.prototype.cancel).toHaveBeenCalledTimes(1);
    // Simulate a resolver that delivers results despite cancellation.
    a.resolve(["93.184.216.34"]);
    aaaa.resolve(["2606:4700:4700::1111"]);
    await tick();
    expect(connections).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("destroys the connection on timeout (body started: %s)", async (bodyStarted) => {
    vi.useFakeTimers();
    const result = fetchNftMetadataJson("https://metadata.example/");
    const rejected = expect(result).rejects.toThrow("timed out");
    await tick();
    if (bodyStarted) sockets[0].push("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{");
    await tick();
    await vi.advanceTimersByTimeAsync(4000);
    await rejected;
    expect(sockets[0].destroyed).toBe(true);
    expect(connections).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one budget for DNS plus body rather than restarting the timer", async () => {
    vi.useFakeTimers();
    const a = deferred<string[]>();
    vi.mocked(Resolver.prototype.resolve4).mockReturnValue(a.promise);
    const result = fetchNftMetadataJson("https://metadata.example/");
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(3000);
    a.resolve(["93.184.216.34"]);
    await tick();
    sockets[0].push("HTTP/1.1 200 OK\r\n\r\n{");
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(sockets[0].destroyed).toBe(true);
  });

  it.each(["ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT"])(
    "preserves TLS refusal %s and never retries over HTTP or another address", async (code) => {
      const result = fetchNftMetadataJson("https://metadata.example/");
      const rejected = expect(result).rejects.toThrow("Metadata download failed.");
      await tick();
      const options = connections[0];
      expect(options.rejectUnauthorized).toBe(true);
      expect(options.servername).toBe("metadata.example");
      const mismatch = options.checkServerIdentity!("93.184.216.34", {
        subjectaltname: "DNS:attacker.example, IP Address:93.184.216.34"
      } as PeerCertificate);
      expect(mismatch).toHaveProperty("code", "ERR_TLS_CERT_ALTNAME_INVALID");
      // The simulated TLS connection supplies the same errors as a failed
      // handshake. Identity checking itself above uses Node's real checker.
      sockets[0].destroy(code === "ERR_TLS_CERT_ALTNAME_INVALID" ? mismatch! : Object.assign(new Error("private TLS details"), { code }));
      await rejected;
      expect(connections).toHaveLength(1);
      expect(Resolver.prototype.resolve4).toHaveBeenCalledTimes(1);
      expect(sockets[0].destroyed).toBe(true);
    }
  );
});
