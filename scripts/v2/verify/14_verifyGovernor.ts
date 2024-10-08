import hre from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying governor on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].governorDelegator,
    constructorArguments: [],
  });

  console.log("Governor verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
