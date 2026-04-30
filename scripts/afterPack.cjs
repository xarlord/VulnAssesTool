/**
 * After Pack Hook for Electron Builder
 *
 * This script runs after the app is packaged but before code signing.
 * It can be used to perform additional packaging steps.
 */

exports.default = async function (context) {
  const { electronPlatformName, appOutDir } = context;

  console.log('After pack hook running...');
  console.log('Platform:', electronPlatformName);
  console.log('Output directory:', appOutDir);

  // Platform-specific post-pack operations
  switch (electronPlatformName) {
    case 'darwin':
      console.log('Performing macOS-specific post-pack operations...');
      // macOS specific operations if needed
      break;

    case 'win32':
      console.log('Performing Windows-specific post-pack operations...');
      // Windows specific operations if needed
      break;

    case 'linux':
      console.log('Performing Linux-specific post-pack operations...');
      // Linux specific operations if needed
      break;
  }

  console.log('After pack hook completed successfully.');
};
