import path from "path";
import alias from "@rollup/plugin-alias";
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import style, { onwarn as onWarnStyle } from "./rollup.style";
import aliasJson from "./tsconfig.alias.json";

const INPUT = "src/index.ts";
const OUTPUT_DIR = "build";

// To change d.ts alias path via tsconfig.alias.json
const ALIAS_ENTRIES = (() => {
  return Object.entries(aliasJson.compilerOptions.paths).map(([from, [to]]) => {
    return {
      find: from.replaceAll("/*", ""),
      replacement: path.resolve(__dirname, to.replaceAll("/*", "")),
    };
  });
})();

const configs = [
  {
    input: INPUT,
    output: [
      {
        dir: OUTPUT_DIR,
        format: "esm",
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    ],
    onwarn: (...args) => {
      onWarnStyle(...args);
    },
    plugins: [
      alias({ entries: ALIAS_ENTRIES }),
      style({
        removePath: "src",
        scopedName: "[local]",
      }),
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
    input: INPUT,
    output: [{ dir: OUTPUT_DIR, format: "esm" }],
    external: [/\.(css|sass|scss)$/],
    plugins: [dts(), alias({ entries: ALIAS_ENTRIES })],
  },
];

export default configs;
