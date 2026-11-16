#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const sourceFiles = Object.freeze([
  "package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs", "tailwind.config.ts",
  "src/setup/app/layout.tsx", "src/setup/app/page.tsx", "src/setup/app/setup.css", "src/setup/SetupProvider.tsx",
  "src/setup/DeploymentSetup.tsx", "src/setup/deploymentSession.ts", "src/setup/deploymentDispatch.ts",
  "src/components/WalletButton.tsx", "src/lib/wagmi.ts", "src/lib/chains.ts", "src/lib/walletProvider.ts",
  "src/lib/walletNetwork.ts", "src/lib/useActiveWalletChain.ts", "src/lib/format.ts", "src/lib/testnetDeploymentPlan.ts",
  "src/lib/testnetDeploymentConfirmation.ts", "src/contracts/testnetDeploymentArtifacts.json", "src/contracts/paramsControllerAbi.ts"
]);
export const publicEnvironment = Object.freeze({ NEXT_PUBLIC_CHAIN_ID: "84532", NEXT_PUBLIC_CHAIN_NAME: "Base Sepolia",
  NEXT_PUBLIC_WALLET_RPC_URL: "https://sepolia.base.org", NEXT_PUBLIC_BLOCK_EXPLORER_URL: "https://sepolia.basescan.org" });
export function validateSetupBuildEnvironment(environment) {
  if (Object.keys(environment).some(key => key.startsWith("NEXT_PUBLIC_") && !Object.hasOwn(publicEnvironment, key)))
    throw new Error("Unsupported public build configuration. Only the four setup settings are permitted.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const setupRelative = ".next/setup-source";

function assertRegular(rootDirectory, relative) {
  const target = path.join(rootDirectory, relative); let current = rootDirectory;
  for (const part of relative.split("/")) { current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error("Setup build inputs must not be symbolic links."); }
  if (!lstatSync(target).isFile()) throw new Error("Setup build input must be a regular file.");
  return target;
}
function assertOutputRoot(rootDirectory) {
  // Never follow an existing .next symlink when cleaning the disposable build directory.
  const next = path.join(rootDirectory, ".next");
  function inspect(target) { try { return lstatSync(target); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
  const nextStat = inspect(next);
  if (nextStat && (!nextStat.isDirectory() || nextStat.isSymbolicLink())) throw new Error("Invalid setup staging directory.");
  const stage = path.join(rootDirectory, setupRelative);
  if (inspect(stage)?.isSymbolicLink()) throw new Error("Invalid setup staging directory.");
  return stage;
}
/** Prepare a new project from an exact allowlist; never copy the existing app or public directory. */
export function prepareSetupProject(frontendRoot = root, commit) {
  frontendRoot = path.resolve(frontendRoot);
  if (lstatSync(frontendRoot).isSymbolicLink()) throw new Error("Invalid frontend root.");
  const inputs = sourceFiles.map(relative => [relative, readFileSync(assertRegular(frontendRoot, relative))]);
  const stage = assertOutputRoot(frontendRoot);
  rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
  const hashes = {};
  for (const [relative, bytes] of inputs) {
    const destination = relative.startsWith("src/setup/app/") ? relative.replace("src/setup/app/", "src/app/") : relative;
    const target = path.join(stage, destination); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes);
    hashes[relative] = createHash("sha256").update(bytes).digest("hex");
  }
  writeFileSync(path.join(stage, "next.config.ts"), 'import type { NextConfig } from "next";\nconst config: NextConfig = { output: "export", reactStrictMode: true, images: { unoptimized: true } };\nexport default config;\n');
  // Search setup and its explicitly copied helpers, not parent app files.
  writeFileSync(path.join(stage, "tailwind.config.ts"), 'import type { Config } from "tailwindcss";\nconst config: Config = { content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: {} }, plugins: [] };\nexport default config;\n');
  const metadata = { version: 1, mode: "setup-only", chainId: 84532,
    ...(typeof commit === "string" && /^[a-f0-9]{40}$/.test(commit) ? { sourceCommit: commit } : {}), sourceHashes: hashes };
  mkdirSync(path.join(stage, "public")); writeFileSync(path.join(stage, "public/setup-build.json"), JSON.stringify(metadata, null, 2) + "\n");
  return { stage, metadata };
}
export function runSetupBuild(frontendRoot = root, environment = process.env) {
  if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error("The isolated setup build requires Node 22.");
  validateSetupBuildEnvironment(environment);
  const { stage, metadata } = prepareSetupProject(frontendRoot, environment.RENDER_GIT_COMMIT);
  const require = createRequire(path.join(path.resolve(frontendRoot), "package.json"));
  const next = require.resolve("next/dist/bin/next");
  const result = spawnSync(process.execPath, [next, "build", stage], { cwd: stage, stdio: "inherit",
    env: { ...environment, ...publicEnvironment, NEXT_TELEMETRY_DISABLED: "1" } });
  if (result.error || result.status !== 0) throw new Error("The isolated setup export failed.");
  return { publishDirectory: path.join(stage, "out"), metadata };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = runSetupBuild(); console.log(`Isolated setup exported to ${result.publishDirectory}`); }
  catch { console.error("Isolated setup build failed; no auction site was published."); process.exitCode = 1; }
}
