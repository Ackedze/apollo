// Reuse the accepted built UI/native ReGlyph flow; add isolated statistics faults.
process.env.APOLLO_STATISTICS_BROWSER_CASES='1';
require('./reglyph.browser.cjs');
