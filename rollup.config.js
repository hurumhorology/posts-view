import path from "path";
import alias from "@rollup/plugin-alias";
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import scss from "rollup-plugin-scss";
import packageJson from "./package.json";
import aliasJson from "./tsconfig.alias.json";

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
      scss(),
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
    external: [/\.(css|sass|scss)$/],
    plugins: [
      dts(),
      alias({
        entries: defineEntries(),
      }),
    ],
  },
];

export default configs;
