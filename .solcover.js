module.exports = {
    modifierWhitelist: ["nonReentrant"],
    skipFiles: [
        "external",
        "mocks",
        "verifiers/VerifierNFTHelper",
        "proxy/UpgradeableBeaconWrapper.sol",
    ],
};
