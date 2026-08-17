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
      ],
      func: async (argv, config, args) => {
        const cliPlugin = require('@react-native/community-cli-plugin');
        const commands = cliPlugin.commands || cliPlugin;
        const bundleCmd = Array.isArray(commands) ? commands.find((c) => c.name === 'bundle') : null;
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

