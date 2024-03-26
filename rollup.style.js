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
 * @property {string} removePath
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
const MAGIC_PATH = "@@_MAGIC_PATH_@@";
const MAGIC_PATH_IMPORT_REGEX = new RegExp(`\\"(${MAGIC_PATH}.*)\\"\\;`, "g");

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
  const matches = fileContent.match(MAGIC_PATH_IMPORT_REGEX);

  if (matches) {
    // find relative paths by compare with currentPath and imported string
    matches.map((matchedStr) => {
      const strPath = matchedStr.replace(`"${MAGIC_PATH}/`, "").slice(0, -2);
      const curPath = currentPath.replace(outputPaths, "").replace("/", "");

      const relativePath = path.relative(path.dirname(curPath), strPath);
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

      let cssFilePath = id.replace(process.cwd(), "").replace(/\\/g, "/");

      // !: This is what I(pyosh) changed (2)
      // css files need to be delete src path
      if (options.removePath && typeof options.removePath === "string") {
        const pathPrefix = options.removePath.startsWith("/") ? "" : "/";
        cssFilePath = cssFilePath.replace(
          `${pathPrefix}${options.removePath}`,
          "",
        );
      }

      // create a new css file with the generated hash class names
      this.emitFile({
        type: "asset",
        fileName: cssFilePath.replace("/", "").replace(loader.regex, ".css"),
        source: postCssResult.extracted.code,
      });

      const importStr = importCSS
        ? `import "${MAGIC_PATH}${cssFilePath.replace(loader.regex, ".css")}";\n`
        : "";

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

const onwarn = (warning, warn) => {
  if (
    warning.code === "UNRESOLVED_IMPORT" &&
    warning.message.includes(MAGIC_PATH)
  )
    return;
  warn(warning);
};

export { onwarn };
export default style;
