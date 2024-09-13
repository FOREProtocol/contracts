import hre from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  await hre.run("verify:verify", {
    address: contractAddresses.marketLib,
    constructorArguments: [],
  });
  console.log("Contract verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
