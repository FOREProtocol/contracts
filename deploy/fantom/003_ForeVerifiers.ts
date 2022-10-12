import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, getChainId } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    await deploy("ForeVerifiers", {
        from: deployer,
        args: [
            chainId === "4002"
                ? process.env.TESTNET_VERIFIERS_BASE_URI
                : process.env.PRODUCTION_VERIFIERS_BASE_URI,
        ],
        log: true,
    });
};
export default func;
func.tags = ["ForeVerifiers"];
