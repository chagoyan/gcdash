// ============================================================
// Build Script — generates config.js from environment variables
// Run automatically by Netlify before deploying.
// ============================================================

const fs = require('fs');

const clientId = process.env.GOOGLE_CLIENT_ID;

if (!clientId) {
	console.error('ERROR: GOOGLE_CLIENT_ID environment variable is not set.');
	process.exit(1);
}

const config = `var CONFIG = {
  clientId: '${clientId}'
};`;

fs.writeFileSync('config.js', config);
console.log('config.js generated successfully.');
