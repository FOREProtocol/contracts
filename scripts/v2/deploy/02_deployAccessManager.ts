import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const accessManagerArtifact = await ethers.getContractFactory(
    "ForeAccessManager"
  );
  const accessManager = await accessManagerArtifact.deploy(deployer.address);
  await accessManager.deployed();

  console.log("AccessManager deployed to:", accessManager.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
