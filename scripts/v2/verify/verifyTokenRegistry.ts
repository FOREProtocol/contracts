import hre, { upgrades } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const implAddress = await upgrades.erc1967.getImplementationAddress(
    contractAddresses.tokenRegistry
  );

  await hre.run("verify:verify", {
    address: implAddress,
    constructorArguments: [],
  });
  console.log("Contract verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
