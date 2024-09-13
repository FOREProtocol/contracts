import { ethers, upgrades } from "hardhat";

import { contractAddresses } from "../constants";

async function main() {
  const ForeUniversalRouterFactory = await ethers.getContractFactory(
    "ForeUniversalRouter"
  );
  const foreUniversalRouter = await upgrades.deployProxy(
    ForeUniversalRouterFactory,
    [
      contractAddresses.accessManager,
      contractAddresses.protocol,
      contractAddresses.permit2,
      [contractAddresses.foreToken, contractAddresses.usdt],
    ]
  );
  await foreUniversalRouter.deployed();

  console.log(
    "FORE universal router deployed to:",
    foreUniversalRouter.address
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
