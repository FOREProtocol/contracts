import hre from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying protocol on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].protocol,
    constructorArguments: [
      contractAddresses[network].protocolConfig,
      process.env.TESTNET_VERIFIERS_BASE_URI,
    ],
  });
  console.log("Protocol verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
