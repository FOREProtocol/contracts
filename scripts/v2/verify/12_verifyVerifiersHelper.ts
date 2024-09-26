import hre from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying NFT helper on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].verifiersNFTHelper,
    constructorArguments: [contractAddresses[network].foreVerifiers],
  });
  console.log("NFT helper verified on Etherscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
