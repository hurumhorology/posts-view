import { existsSync, mkdirSync, writeFileSync } from "fs";
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
import aliasJson from "./tsconfig.alias.json";

const INPUT = "src/index.ts";
const OUTPUT_DIR = "build";

const defineStyleOutputs = (styles, styleNodes) => {
  Object.entries(styleNodes ?? {}).forEach(([fileName, style]) => {
    // change src -> build
    const fileRelativePath = path.relative(
      "src",
      fileName.slice(0, fileName.length - path.extname(fileName).length),
    );
    const filePath = path.resolve(__dirname, OUTPUT_DIR, fileRelativePath);
    const dirPath = path.dirname(filePath);
    const buildPath = path.resolve(dirPath, "index.css");

    // should create directory before write file
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    writeFileSync(buildPath, style);
  });
};

// To change d.ts alias path via tsconfig.alias.json
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
    input: INPUT,
    output: [
      {
        dir: OUTPUT_DIR,
        format: "esm",
        sourcemap: true,
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    ],
    plugins: [
      scss({ output: defineStyleOutputs }),
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
    plugins: [
      dts(),
      alias({
        entries: defineEntries(),
      }),
    ],
  },
];

export default configs;
