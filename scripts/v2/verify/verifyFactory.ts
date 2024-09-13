import hre from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  await hre.run("verify:verify", {
    address: contractAddresses.factory,
    constructorArguments: [
      contractAddresses.accessManager,
      contractAddresses.protocol,
      contractAddresses.tokenRegistry,
      contractAddresses.accountWhitelist,
      contractAddresses.feeReceiver,
      contractAddresses.router,
    ],
  });
  console.log("Contract verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
