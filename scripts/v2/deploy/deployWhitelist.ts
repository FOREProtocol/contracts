import { ethers, upgrades } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const AccountWhitelistFactory = await ethers.getContractFactory(
    "AccountWhitelist"
  );
  const accountWhitelist = await upgrades.deployProxy(AccountWhitelistFactory, [
    contractAddresses.accessManager,
    [],
  ]);
  await accountWhitelist.deployed();

  console.log("Account whitelist to:", accountWhitelist.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
