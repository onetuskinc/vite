'use strict';

const upath = require('upath');
const consola = require('consola');
const semver = require('semver');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

const consola__default = /*#__PURE__*/_interopDefaultLegacy(consola);

var name = "nuxt-vite";
var version = "0.1.1";

function nuxtVite() {
  var _a, _b;
  const {nuxt} = this;
  if (!nuxt.options.dev) {
    return;
  }
  const minVersion = "2.15.2";
  const currentVersion = nuxt.constructor.version || "0.0.0";
  if (semver.lt(nuxt.constructor.version, minVersion)) {
    consola__default['default'].warn(`disabling nuxt-vite since nuxt >= ${minVersion} is required (curret version: ${currentVersion})`);
    return;
  }
  const ssrEnabled = nuxt.options.ssr && ((_a = nuxt.options.vite) == null ? void 0 : _a.ssr);
  if (!ssrEnabled) {
    nuxt.options.ssr = false;
    nuxt.options.render.ssr = false;
    nuxt.options.build.ssr = false;
    nuxt.options.mode = "spa";
  }
  nuxt.options.cli.badgeMessages.push(`\u26A1  Vite Mode Enabled (v${version})`);
  if (((_b = nuxt.options.vite) == null ? void 0 : _b.experimentWarning) !== false && !nuxt.options.test) {
    consola__default['default'].log("\u{1F9EA}  Vite mode is experimental and some nuxt modules might be incompatible\n", "   If found a bug, please report via https://github.com/nuxt/vite/issues with a minimal reproduction." + (ssrEnabled ? "\n    Unstable server-side rendering is enabled" : "\n    You can enable unstable server-side rendering using `vite: { ssr: true }` in `nuxt.config`"));
  }
  nuxt.options.build.loadingScreen = false;
  nuxt.options.build.indicator = false;
  nuxt.options._modules = nuxt.options._modules.filter((m) => !(Array.isArray(m) && m[0] === "@nuxt/loading-screen"));
  const getModuleName = (m) => {
    if (Array.isArray(m)) {
      m = m[0];
    }
    return m.meta ? m.meta.name : m;
  };
  const filterModule = (modules) => modules.filter((m) => getModuleName(m) !== "nuxt-vite");
  nuxt.options.modules = filterModule(nuxt.options.modules);
  nuxt.options.buildModules = filterModule(nuxt.options.buildModules);
  if (nuxt.options.store) {
    this.addTemplate({
      src: upath.resolve(__dirname, "./runtime/templates", "store.mjs"),
      fileName: "store.js"
    });
  }
  this.addTemplate({
    src: upath.resolve(__dirname, "./runtime/templates", "middleware.mjs"),
    fileName: "middleware.js"
  });
  nuxt.hook("builder:prepared", async (builder) => {
    builder.bundleBuilder.close();
    delete builder.bundleBuilder;
    const {ViteBuilder} = await Promise.resolve().then(function () { return require('./nuxt-vite.js-vite.js'); });
    builder.bundleBuilder = new ViteBuilder(builder);
  });
}
nuxtVite.meta = {name, version};

module.exports = nuxtVite;
