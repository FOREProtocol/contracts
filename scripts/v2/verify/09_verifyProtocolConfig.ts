import hre, { ethers } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying protocol config on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].protocolConfig,
    constructorArguments: [
      process.env.FOUNDATION_WALLET,
      process.env.HIGH_GUARD_WALLET,
      contractAddresses[network].marketplace, // marketplace
      contractAddresses[network].foreToken, // foreToken
      contractAddresses[network].foreVerifiers, // fore verifiers
      ethers.utils.parseEther("10"), // market creation price
      ethers.utils.parseEther("1000"), // verifier mint price
    ],
  });
  console.log("Protocol config verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
