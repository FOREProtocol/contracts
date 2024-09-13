import hre, { ethers } from "hardhat";
import { contractAddresses } from "../constants";

// `npx hardhat run scripts/v1/verify/verifyProtocolConfig.ts --network arbitrum`
async function main() {
  const network = hre.hardhatArguments.network;

  console.log(`Verifying protocol config on ${network}...`);

  await hre.run("verify:verify", {
    address: contractAddresses[network].protocolConfig,
    constructorArguments: [
      process.env.REVENUE_WALLET,
      process.env.HIGH_GUARD_WALLET,
      contractAddresses[network].marketplace,
      contractAddresses[network].foreToken,
      contractAddresses[network].foreVerifiers,
      ethers.utils.parseEther("10"),
      ethers.utils.parseEther("1000"),
    ],
  });

  console.log("Protocol config contract verified on Arbiscan");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
