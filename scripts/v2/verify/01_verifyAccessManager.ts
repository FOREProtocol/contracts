import hre, { ethers } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;
  const [deployer] = await ethers.getSigners();

  console.log(`Verifying access manager on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].accessManager,
    constructorArguments: [deployer.address],
    contract: "contracts/access/ForeAccessManager.sol:ForeAccessManager",
  });
  console.log("Access manager verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
