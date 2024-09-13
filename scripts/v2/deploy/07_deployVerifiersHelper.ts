import hre, { ethers } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Deploying NFT helper on ${network}...`);

  const VerifierNFTHelperArtifacts = await ethers.getContractFactory(
    "VerifierNFTHelper"
  );
  const nftHelper = await VerifierNFTHelperArtifacts.deploy(
    contractAddresses[network].foreVerifiers
  );
  await nftHelper.deployed();

  console.log("NFT Helper deployed to:", nftHelper.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
