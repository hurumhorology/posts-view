import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";
import aliasJson from "../tsconfig.alias.json";

const defineEntries = () => {
  return Object.entries(aliasJson.compilerOptions.paths).reduce(
    (acc, [from, [to]]) => {
      const key = from.replace(new RegExp("\\/\\*", "g"), "");
      const value = path.resolve(
        __dirname,
        "..",
        to.replace(new RegExp("\\/\\*", "g"), ""),
      );
      acc[key] = value;
      return acc;
    },
    {},
  );
};

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-onboarding",
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@chromatic-com/storybook",
    "@storybook/addon-interactions",
    "@storybook/addon-styling-webpack"
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  async viteFinal(config) {
    config.resolve = {
      alias: defineEntries(),
    };
    config.define = {
      ...(config?.define ?? {}),
      "process.env.NODE_DEBUG": false,
    };

    return config;
  },
};
export default config;
