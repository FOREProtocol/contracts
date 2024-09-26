import hre from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying factory on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].factory,
    constructorArguments: [
      contractAddresses[network].accessManager,
      contractAddresses[network].protocol,
      contractAddresses[network].tokenRegistry,
      contractAddresses[network].accountWhitelist,
      process.env.FOUNDATION_WALLET,
      contractAddresses[network].router,
    ],
  });
  console.log("Factory verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
