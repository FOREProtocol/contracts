import hre, { ethers, upgrades } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Deploying account whitelist on ${network}...`);

  const AccountWhitelistFactory = await ethers.getContractFactory(
    "AccountWhitelist"
  );
  const accountWhitelist = await upgrades.deployProxy(AccountWhitelistFactory, [
    contractAddresses[network].accessManager,
    [],
  ]);
  await accountWhitelist.deployed();

  console.log("Account whitelist to:", accountWhitelist.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
