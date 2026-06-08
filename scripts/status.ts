/**
 * Show SmartSentinel health status.
 * Usage: npm run status
 */

async function main(): Promise<void> {
  console.log("SmartSentinel Status Check");
  console.log("==========================");
  console.log("Status: Not yet connected (Phase 1 needed)");
  console.log("");
  console.log("Anvil: Checking...");
  try {
    const { execSync } = require("child_process");
    const version = execSync("anvil --version", { encoding: "utf-8" }).trim();
    console.log(`Anvil: ${version}`);
  } catch {
    console.log("Anvil: NOT FOUND - Install Foundry (https://getfoundry.sh)");
  }
}

main().catch(console.error);