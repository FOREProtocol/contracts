import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import { getDeployedContract } from "../helpers/utils";
import { ProtocolConfig } from "@/ProtocolConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const foreProtocol: Contract = await getDeployedContract("ForeProtocol");
    const marketLib: Contract = await getDeployedContract("MarketLib");

    const deployment = await deploy("BasicFactory", {
        from: deployer,
        args: [foreProtocol.address],
        log: true,
        libraries: {
            MarketLib: marketLib.address,
        },
    });

    if (deployment.newlyDeployed) {
        const protocolConfig: ProtocolConfig = await getDeployedContract(
            "ProtocolConfig"
        );

        await protocolConfig.setFactoryStatus([deployment.address], [true]);
    }
};
export default func;
func.tags = [
    "BasicFactory",
    "ProtocolConfig",
    "ForeToken",
    "ForeNftMarketplace",
    "ForeVerifiers",
];
