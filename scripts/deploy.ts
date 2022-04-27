import { ethers } from "hardhat";

async function main() {
  // Fore Token
  const ForeTokenArtifact = await ethers.getContractFactory("ForeToken");
  const foretoken = await ForeTokenArtifact.deploy();
  await foretoken.deployed();
  console.log("ForeToken deployed to:", foretoken.address);

  // Vesting
  const VestingArtifact = await ethers.getContractFactory("ForeVesting");
  const vesting = await VestingArtifact.deploy(foretoken.address);
  await vesting.deployed();
  console.log("Vesting deployed to:", vesting.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
