import hre, { upgrades } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying router on ${network}...`);

  const implAddress = await upgrades.erc1967.getImplementationAddress(
    contractAddresses[network].router
  );

  await hre.run("verify:verify", {
    address: implAddress,
    constructorArguments: [],
  });
  console.log("FORE universal router verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
