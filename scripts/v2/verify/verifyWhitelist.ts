import hre, { upgrades } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const implAddress = await upgrades.erc1967.getImplementationAddress(
    contractAddresses.accountWhitelist
  );

  await hre.run("verify:verify", {
    address: implAddress,
    constructorArguments: [],
  });
  console.log("Account whitelist verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
