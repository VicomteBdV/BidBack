import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareSetupProject, sourceFiles, publicEnvironment, validateSetupBuildEnvironment } from "./build-testnet-setup.mjs";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "bidback-setup-builder-"));
  for (const file of sourceFiles) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), `Fixture ${file}\n`); }
  return root;
}
function files(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
test("copies only exact setup inputs and emits a separate static project", () => {
  const root = fixture();
  try {
    for (const extra of ["src/app/page.tsx", "src/app/api/dev/route.ts", "src/setup/secret.txt", "public/deployments/84532.json", ".env.local", "src/lib/unselected.ts"])
      { mkdirSync(path.dirname(path.join(root, extra)), { recursive: true }); writeFileSync(path.join(root, extra), "DO NOT COPY"); }
    const commit = "a".repeat(40), { stage, metadata } = prepareSetupProject(root, commit), output = files(stage);
    const expected = sourceFiles.map(file => file.replace(/^src\/setup\/app\//, "src/app/"));
    assert.deepEqual(output.sort(), [...expected, "next.config.ts", "public/setup-build.json"].sort());
    assert.equal(metadata.mode, "setup-only"); assert.equal(metadata.sourceCommit, commit); assert.equal(Object.keys(metadata.sourceHashes).length, sourceFiles.length);
    assert.match(readFileSync(path.join(stage, "next.config.ts"), "utf8"), /output: "export"/);
    assert.match(readFileSync(path.join(stage, "src/app/page.tsx"), "utf8"), /Fixture src\/setup\/app\/page/);
    for (const forbidden of ["src/app/api", "public/deployments", ".env.local", "src/setup/secret.txt"]) assert.equal(existsSync(path.join(stage, forbidden)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("refuses symlinked source files and parent directories", () => {
  for (const target of ["src/setup/app/page.tsx", "src/contracts"]) {
    const root = fixture(), outside = mkdtempSync(path.join(os.tmpdir(), "bidback-outside-"));
    try {
      const selected = path.join(root, target); rmSync(selected, { recursive: true });
      symlinkSync(outside, selected);
      assert.throws(() => prepareSetupProject(root), /symbolic links/);
      assert.equal(existsSync(path.join(root, ".next/setup-source")), false);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  }
});
test("refuses symlinked staging roots without deleting their targets", () => {
  const root = fixture(), outside = mkdtempSync(path.join(os.tmpdir(), "bidback-stage-"));
  try {
    writeFileSync(path.join(outside, "keep"), "keep"); symlinkSync(outside, path.join(root, ".next"));
    assert.throws(() => prepareSetupProject(root), /staging/); assert.equal(readFileSync(path.join(outside, "keep"), "utf8"), "keep");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
test("does not copy invalid commit metadata or configurable RPC values", () => {
  const root = fixture();
  try {
    const { metadata } = prepareSetupProject(root, "https://untrusted.invalid/"); assert.equal("sourceCommit" in metadata, false);
    assert.equal("sourceCommit" in prepareSetupProject(root).metadata, false);
    assert.deepEqual(publicEnvironment, { NEXT_PUBLIC_CHAIN_ID: "84532", NEXT_PUBLIC_CHAIN_NAME: "Base Sepolia", NEXT_PUBLIC_WALLET_RPC_URL: "https://sepolia.base.org", NEXT_PUBLIC_BLOCK_EXPLORER_URL: "https://sepolia.basescan.org" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("rejects any public environment key outside the closed setup profile", () => {
  assert.doesNotThrow(() => validateSetupBuildEnvironment({ ...publicEnvironment, PATH: "/tools" }));
  for (const key of ["NEXT_PUBLIC_ANVIL_RPC_URL", "NEXT_PUBLIC_UNEXPECTED", "NEXT_PUBLIC_PRIVATE_KEY"])
    assert.throws(() => validateSetupBuildEnvironment({ ...publicEnvironment, [key]: "never print this value" }), /Unsupported public/);
});
