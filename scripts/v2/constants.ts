import { ethers } from "ethers";

export const incentives = {
  foreToken: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 0,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
  },
  usdt: {
    predictionDiscountRate: 1000,
    marketCreatorDiscountRate: 1000,
    verificationDiscountRate: 0,
    foundationDiscountRate: 1000,
    marketCreationFee: ethers.utils.parseEther("10"),
  },
};

export const contractAddresses = {
  arbitrumTestnet: {
    accessManager: "0x664d1e8a89C240e27f511b474e71a6845edC17d8",
    protocol: "0x58718251d687DF51b7cc4c75546eE57a624B9A4f",
    protocolConfig: "0x741eDDD71FC1231D466e5f4d6975a2f3ec40F8D3",
    foreToken: "0x0B34793E6E996aA34031d29f4b62b2e9ad684B4A",
    mockUsdt: "0x7b092Da900Bcaf79F8228966Eb4f345945bf4645",
    tokenRegistry: "0xACa790cba249eA677Ac3d105B3d2973Eb850c0f9",
    factory: "0xE3FD02203E605B500364E8d175bD286a4b136Bf3",
    marketLib: "0x3d19A9DD392Fa4a9690e124DeaE55f14988A0B90",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    router: "0x09Dc07116C24A0EF76420316F0aCb3e227033a1b",
    accountWhitelist: "0xc4aa77159C190349FC2EfD40511E42597ff95b4C",
    marketplace: "0x0e3Bb834e8b7ce33A5666cB69e59ead693830669",
    foreVerifiers: "0x7Bd2102a585E03229a4Ddf7D45cA5399E8e23Bb5",
    verifiersNFTHelper: "0x063316a43c53c73b7e096beC6f2DAc12d7900437",
    governorDelegate: "0xD626657f577A12E9362B36E3125fD7Ff9e176C79",
    governorDelegator: "0x8E3384A585888E4FB062D96B6d230684892E6C0f",
    timelock: "0xA61Bbc84c29Ea25F56Cc37aC0c0EA1a5A539F996",
  },
};
