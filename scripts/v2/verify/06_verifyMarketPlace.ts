import hre, { ethers } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying marketplace on ${network}...`);

  const [deployer] = await ethers.getSigners();

  await hre.run("verify:verify", {
    address: contractAddresses[network].marketplace,
    constructorArguments: [
      deployer.address,
      process.env.REVENUE_WALLET,
      contractAddresses[network].foreToken,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1000000000"),
    ],
  });
  console.log("Contract verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
