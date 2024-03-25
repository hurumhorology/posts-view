// Refs: https://www.npmjs.com/package/rollup-plugin-multi-input
// Could not load 'rollup-plugin-multi-input' function with cjs config
// So we copied code in this file from 'rollup-plugin-multi-input'
import path from "path";
import fastGlob from "fast-glob";

const pluginName = "rollup-plugin-multi-input";

const isString = (value) => typeof value === "string";

const defaultOptions = {
  relative: `src${path.sep}`,
};

const outputFileName = (filePath) =>
  filePath.replace(/\.[^/.]+$/, "").replace(/\\/g, "/");

const multiInput = (options = defaultOptions) => {
  const {
    glob: globOptions,
    relative = defaultOptions.relative,
    transformOutputPath,
  } = options;

  return {
    name: pluginName,
    options(conf) {
      const inputs = [conf.input].flat();
      const globs = inputs.filter(isString);
      const others = inputs.filter((value) => !isString(value));
      const normalizedGlobs = globs.map((glob) => glob.replace(/\\/g, "/"));
      const entries = fastGlob
        .sync(normalizedGlobs, globOptions)
        .map((name) => {
          const filePath = path.relative(relative, name);
          const isRelative = !filePath.startsWith(`..${path.sep}`);
          const relativeFilePath = isRelative
            ? filePath
            : path.relative(`.${path.sep}`, name);
          if (transformOutputPath) {
            return [
              outputFileName(transformOutputPath(relativeFilePath, name)),
              name,
            ];
          }

          return [outputFileName(relativeFilePath), name];
        });
      const input = Object.assign({}, Object.fromEntries(entries), ...others);

      return {
        ...conf,
        input,
      };
    },
  };
};
export default multiInput;
