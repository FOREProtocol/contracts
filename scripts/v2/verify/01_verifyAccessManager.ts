import hre from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying access manager on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].accessManager,
    constructorArguments: [process.env.FOUNDATION_WALLET],
  });
  console.log("Access manager verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
