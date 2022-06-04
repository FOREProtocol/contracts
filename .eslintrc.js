module.exports = {
    env: {
        browser: false,
        es2021: true,
        mocha: true,
        node: true,
    },
    plugins: ["@typescript-eslint"],
    extends: [
        "standard",
        "plugin:prettier/recommended",
        "plugin:node/recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: 12,
    },
    rules: {
        "node/no-extraneous-import": "off",
        "node/no-missing-import": "off",
        "node/no-unsupported-features/es-syntax": [
            "error",
            { ignores: ["modules"] },
        ],
        indent: "off",
    },
};
