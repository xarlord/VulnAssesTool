/**
 * After Sign Hook for macOS Notarization
 *
 * This script handles macOS app notarization using electron-notarize.
 * Notarization is required for macOS apps distributed outside the App Store.
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing (context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization if no credentials are provided
  // This allows for local builds without notarization
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('Skipping macOS notarization - no credentials provided');
    console.log('To enable notarization, set the following environment variables:');
    console.log('  - APPLE_ID: Your Apple ID email');
    console.log('  - APPLE_ID_PASSWORD: App-specific password for notarization');
    console.log('  - APPLE_TEAM_ID: Your Apple Developer Team ID');
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    tool: 'notarytool',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
