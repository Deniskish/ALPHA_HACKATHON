// Static markup tests run in Node, without Vite's asset loader or a browser.
// Alfa components query media and import their CSS; both are stubbed here. Interactive behavior is checked in Playwright.
const media = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
global.window = { matchMedia: media };
global.matchMedia = media;
// tsx may compile imported components with the classic JSX runtime outside Vite.
global.React = require('react');
require.extensions['.css'] = () => {};
require.extensions['.webp'] = (module, filename) => { module.exports = filename; };
