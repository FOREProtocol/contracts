import hre, { ethers } from "hardhat";

import { TIME_LOCK_DELAY } from "../../../test/helpers/constants";
import { contractAddresses } from "../constants";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.hardhatArguments.network;

  console.log(`Verifying timelock on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].timelock,
    constructorArguments: [deployer.address, TIME_LOCK_DELAY],
  });

  console.log("Timelock verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
