module.exports = {
  project: {
    android: {
      sourceDir: './android',
      appName: 'app',
      packageName: 'com.nana.robot',
    },
  },
  commands: [
    {
      name: 'bundle',
      description: 'Build JS bundle with safe default fallback flags',
      options: [
        {
          name: '--platform <string>',
          description: 'Target platform',
          default: 'android',
        },
        {
          name: '--entry-file <string>',
          description: 'Path to entry file',
          default: 'index.js',
        },
        {
          name: '--bundle-output <string>',
          description: 'Path to bundle output file',
          default: 'android/app/src/main/assets/index.android.bundle',
        },
        {
          name: '--dev [boolean]',
          description: 'Enable dev mode',
          default: false,
          parse: (val) => val !== 'false',
        },
        {
          name: '--assets-dest <string>',
          description: 'Assets destination directory',
          default: 'android/app/src/main/res',
        },
        {
          name: '--reset-cache',
          description: 'Remove cached files',
        },
        {
          name: '--sourcemap-output <string>',
          description: 'File name where to store the sourcemap file',
        },
        {
          name: '--minify [boolean]',
          description: 'Allows overriding whether bundle is minified',
          parse: (val) => val !== 'false',
        },
        {
          name: '--config <string>',
          description: 'Path to the CLI configuration file',
        },
        {
          name: '--verbose',
          description: 'Enables logging',
        },
      ],
      func: async (argv, config, args) => {
        const cliPlugin = require('@react-native/community-cli-plugin');
        const bundleCmd = cliPlugin.bundleCommand || (Array.isArray(cliPlugin.commands) ? cliPlugin.commands.find((c) => c.name === 'bundle') : null);
        const safeArgs = {
          platform: args.platform || 'android',
          entryFile: args.entryFile || 'index.js',
          bundleOutput: args.bundleOutput || 'android/app/src/main/assets/index.android.bundle',
          assetsDest: args.assetsDest || 'android/app/src/main/res',
          dev: args.dev !== undefined ? args.dev : false,
          ...args,
        };
        if (bundleCmd && typeof bundleCmd.func === 'function') {
          return bundleCmd.func(argv, config, safeArgs);
        }
      },
    },
  ],
};

