import {dirname} from "path";
import {fileURLToPath} from "url";
import {FlatCompat} from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

const eslintConfig = [
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
        // Disable specific rules for test files
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-require-imports": "off"
        }
    }
];

export default eslintConfig;
