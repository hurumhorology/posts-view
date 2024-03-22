import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import packageJson from "./package.json";
import alias from "@rollup/plugin-alias";
import aliasJson from "./tsconfig.alias.json";
import path from "path";
import { dts } from "rollup-plugin-dts";

const defineEntries = () => {
  return Object.entries(aliasJson.compilerOptions.paths).map(([from, [to]]) => {
    return {
      find: from.replaceAll("/*", ""),
      replacement: path.resolve(__dirname, to.replaceAll("/*", "")),
    };
  });
};

const configs = [
  {
    input: "src/index.ts",
    output: [
      {
        file: packageJson.main,
        format: "cjs",
        sourcemap: true,
      },
      {
        file: packageJson.module,
        format: "esm",
        sourcemap: true,
      },
    ],
    plugins: [
      peerDepsExternal(),
      resolve(),
      commonjs(),
      babel({
        babelHelpers: "bundled",
        presets: [
          "@babel/preset-env",
          "@babel/preset-react",
          "@babel/preset-typescript",
        ],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      }),
      typescript(),
      terser(),
    ],
  },
  {
    input: "src/index.ts",
    output: [
      { file: "build/esm/index.d.ts", format: "es" },
      { file: "build/cjs/index.d.ts", format: "cjs" },
    ],
    plugins: [
      dts(),
      alias({
        entries: defineEntries(),
      }),
    ],
  },
];

export default configs;
