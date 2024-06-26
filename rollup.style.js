// Refs: https://github.com/danielamenou/rollup-plugin-lib-style
//       from npm - rollup-plugin-lib-style

import crypto from "node:crypto";
import path from "path";
import fs from "fs-extra";
import glob from "glob";
import postcss from "postcss";
import postcssModules from "postcss-modules";
import { createFilter } from "rollup-pluginutils";
import sass from "sass";

const hashFormats = ["latin1", "hex", "base64"];

const replaceFormat = (formatString, fileName, cssContent) => {
  const hashLengthMatch = formatString.match(/hash:.*:(\d+)/);
  const hashFormatMatch = formatString.match(/hash:([^:]*)[:-]?/);
  const hashFormat =
    hashFormatMatch && hashFormats.includes(hashFormatMatch[1])
      ? hashFormatMatch[1]
      : "hex";
  const hashLength = hashLengthMatch ? parseInt(hashLengthMatch[1]) : 6;
  const hashString = crypto
    .createHash("md5")
    .update(cssContent)
    .digest(hashFormat);
  const hashToUse =
    hashString.length < hashLength
      ? hashString
      : hashString.slice(0, hashLength);

  return formatString
    .replace("[local]", fileName)
    .replace(/\[hash:(.*?)(:\d+)?\]/, hashToUse);
};

const DEFAULT_SCOPED_NAME = "[local]_[hash:hex:6]";

/**
 * @typedef {object} postCssLoaderOptions
 * @property {object[]} postCssPlugins
 * @property {string} classNamePrefix
 * @property {string} scopedName
 * @property {string} inputDir
 * @property {string} outputDir
 */

/**
 * @typedef {object} postCssLoaderProps
 * @property {postCssLoaderOptions} options
 * @property {string} fiePath
 * @property {string} code
 */

/**
 * Transform CSS into CSS-modules
 * @param {postCssLoaderProps}
 * @returns
 */
const postCssLoader = async ({ code, fiePath, options }) => {
  const {
    scopedName = DEFAULT_SCOPED_NAME,
    postCssPlugins = [],
    classNamePrefix = "",
  } = options;

  const modulesExported = {};

  const isGlobalStyle = /\.global.(css|scss|sass|less|stylus)$/.test(fiePath);
  const isInNodeModules = /[\\/]node_modules[\\/]/.test(fiePath);

  const postCssPluginsWithCssModules = [
    postcssModules({
      generateScopedName: (name, filename, css) => {
        return isInNodeModules || isGlobalStyle
          ? name
          : classNamePrefix + replaceFormat(scopedName, name, css);
      },
      getJSON: (cssFileName, json) => (modulesExported[cssFileName] = json),
    }),
    ...postCssPlugins,
  ];

  const postcssOptions = {
    from: fiePath,
    to: fiePath,
    map: false,
  };

  const result = await postcss(postCssPluginsWithCssModules).process(
    code,
    postcssOptions,
  );

  // collect dependencies
  const dependencies = [];
  for (const message of result.messages) {
    if (message.type === "dependency") {
      dependencies.push(message.file);
    }
  }

  // print postcss warnings
  for (const warning of result.warnings()) {
    console.warn(`WARNING: ${warning.plugin}:`, warning.text);
  }

  return {
    code: `export default ${JSON.stringify(modulesExported[fiePath])};`,
    dependencies,
    extracted: {
      id: fiePath,
      code: result.css,
    },
  };
};

const PLUGIN_NAME = "rollup-plugin-lib-style";
const CSS_IMPORT_REGEX = new RegExp(`import[- ]?['"]([^;]*)\\.css['"];`, "gm");
const CSS_IMPORT_DELETE_REGEX = new RegExp(`((import)|\\s|'|"|;)`, "g");
const modulesIds = new Set();
const outputPaths = [];

const defaultLoaders = [
  {
    name: "sass",
    regex: /\.(sass|scss)$/,
    process: ({ filePath }) => ({
      code: sass.compile(filePath).css.toString(),
    }),
  },
  {
    name: "css",
    regex: /\.(css)$/,
    process: ({ code }) => ({ code }),
  },
];

// !: This is what I(pyosh) changed (1)
// css file imports need to be relative by its file
const replaceMagicPath = (currentPath, fileContent, customPath = ".") => {
  const matches = fileContent?.match(CSS_IMPORT_REGEX);
  if (matches) {
    // find relative paths by compare with currentPath and imported string
    matches.map((matchedStr) => {
      const curDir = path.dirname(path.join(__dirname, currentPath));
      const strPath = path.join(
        curDir,
        matchedStr.replace(CSS_IMPORT_DELETE_REGEX, ""),
      );
      const relativePath = path.relative(curDir, strPath);
      const realPath = `${customPath ? `${customPath}/` : ""}${relativePath}`;
      fileContent = fileContent.replace(matchedStr, `"${realPath}";`);
    });
  }

  return fileContent;
};

const style = (options = {}) => {
  const {
    customPath,
    loaders,
    include,
    exclude,
    importCSS = true,
    ...postCssOptions
  } = options;
  const allLoaders = [...(loaders || []), ...defaultLoaders];
  const filter = createFilter(include, exclude);
  const getLoader = (filepath) =>
    allLoaders.find((loader) => loader.regex.test(filepath));

  return {
    name: PLUGIN_NAME,

    options(options) {
      if (!options.output) console.error("missing output options");
      else
        options.output.forEach((outputOptions) =>
          outputPaths.push(outputOptions.dir),
        );
    },

    async transform(code, id) {
      const loader = getLoader(id);
      if (!filter(id) || !loader) return null;
      modulesIds.add(id);

      const rawCss = await loader.process({ filePath: id, code });

      const postCssResult = await postCssLoader({
        code: rawCss.code,
        fiePath: id,
        options: postCssOptions,
      });

      for (const dependency of postCssResult.dependencies)
        this.addWatchFile(dependency);

      let cssFilePath = id
        .replace(process.cwd(), "")
        .replace(/\\/g, "/")
        .replace(loader.regex, ".css");

      // !: This is what I(pyosh) changed (2)
      // css files need to be delete src path
      if (options.inputDir && typeof options.inputDir === "string") {
        const pathPrefix = options.inputDir.startsWith("/") ? "" : "/";
        cssFilePath = cssFilePath.replace(
          `${pathPrefix}${options.inputDir}`,
          "",
        );
      }

      // create a new css file with the generated hash class names
      this.emitFile({
        type: "asset",
        fileName: cssFilePath.replace("/", ""),
        source: postCssResult.extracted.code,
      });

      let cssImportPath = cssFilePath;

      // !: This is what I(pyosh) changed (3)
      // css files need to be add build path
      if (options.outputDir && typeof options.outputDir === "string") {
        const pathPrefix = cssImportPath.startsWith("/") ? "" : "/";
        const dirPrefix = options.outputDir.startsWith("/") ? "" : "/";
        cssImportPath = `${dirPrefix}${options.outputDir}${pathPrefix}${cssImportPath}`;
      }

      cssImportPath = path.join(__dirname, cssImportPath);

      // !: DO NOT USE MAGIC PATH
      //   if sideEffects: true, it will not work
      const importStr = importCSS ? `import "${cssImportPath}";\n` : "";

      // create a new js file with css module
      return {
        code: importStr + postCssResult.code,
        map: { mappings: "" },
      };
    },

    async closeBundle() {
      if (!importCSS) return;

      // get all the modules that import CSS files
      const importersPaths = outputPaths
        .reduce((result, currentPath) => {
          result.push(glob.sync(`${currentPath}/**/*.js`));

          return result;
        }, [])
        .flat();

      // replace magic path with relative path
      await Promise.all(
        importersPaths.map((currentPath) =>
          fs
            .readFile(currentPath)
            .then((buffer) => buffer.toString())
            .then((fileContent) => replaceMagicPath(currentPath, fileContent))
            .then((fileContent) => fs.writeFile(currentPath, fileContent)),
        ),
      );
    },
  };
};

const CSS_UNRESOLVED_REGEX = new RegExp(
  `\\.css" is imported by "(.*)\\.(css|scss|sass|less|stylus)"`,
  "g",
);
const onwarn = (warning, warn) => {
  if (
    warning.code === "UNRESOLVED_IMPORT" &&
    warning.message.match(CSS_UNRESOLVED_REGEX)
  ) {
    return;
  }
  warn(warning);
};

export { onwarn };
export default style;
