'use strict';

const path = require('path');
const vite = require('vite');
const consola = require('consola');
const vitePluginVue2 = require('vite-plugin-vue2');
const chokidar = require('chokidar');
const fsExtra = require('fs-extra');
const debounce = require('debounce');
const upath = require('upath');
const createResolver = require('postcss-import-resolver');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () {
            return e[k];
          }
        });
      }
    });
  }
  n['default'] = e;
  return Object.freeze(n);
}

const vite__namespace = /*#__PURE__*/_interopNamespace(vite);
const consola__default = /*#__PURE__*/_interopDefaultLegacy(consola);
const fsExtra__default = /*#__PURE__*/_interopDefaultLegacy(fsExtra);
const debounce__default = /*#__PURE__*/_interopDefaultLegacy(debounce);
const createResolver__default = /*#__PURE__*/_interopDefaultLegacy(createResolver);

const needsJsxProcessing = (id = "") => !id.includes("node_modules") && [".vue", ".jsx", ".tsx"].some((extension) => id.includes(extension));
function jsxPlugin() {
  return {
    name: "nuxt:jsx",
    transform(code, id) {
      if (!needsJsxProcessing(id)) {
        return null;
      }
      return {
        code: code.replace(/render\s*\(\s*\)\s*\{/g, "render(h){"),
        map: null
      };
    }
  };
}

function replace(replacements) {
  return {
    name: "nuxt:replace",
    transform(code) {
      Object.entries(replacements).forEach(([key, value]) => {
        const escapedKey = key.replace(/\./g, "\\.");
        code = code.replace(new RegExp(escapedKey, "g"), value);
      });
      return {
        code,
        map: null
      };
    }
  };
}

async function buildClient(ctx) {
  const alias = {};
  for (const p of ctx.builder.plugins) {
    alias[p.name] = p.mode === "server" ? `defaultexport:${path.resolve(ctx.nuxt.options.buildDir, "empty.js")}` : `defaultexport:${p.src}`;
  }
  const clientConfig = vite__namespace.mergeConfig(ctx.config, {
    define: {
      "process.server": false,
      "process.client": true,
      global: "window",
      "module.hot": false
    },
    cacheDir: path.resolve(ctx.nuxt.options.rootDir, "node_modules/.cache/vite/client"),
    resolve: {
      alias
    },
    build: {
      outDir: "dist/client",
      assetsDir: ".",
      rollupOptions: {
        input: path.resolve(ctx.nuxt.options.buildDir, "client.js")
      }
    },
    plugins: [
      replace({"process.env": "import.meta.env"}),
      jsxPlugin(),
      vitePluginVue2.createVuePlugin(ctx.config.vue)
    ],
    server: {
      middlewareMode: true
    }
  });
  await ctx.nuxt.callHook("vite:extendConfig", clientConfig, {isClient: true, isServer: false});
  const viteServer = await vite__namespace.createServer(clientConfig);
  await ctx.nuxt.callHook("vite:serverCreated", viteServer);
  const viteMiddleware = (req, res, next) => {
    const originalURL = req.url;
    if (req.url === "/_nuxt/client.js") {
      return res.end("");
    }
    viteServer.middlewares.handle(req, res, (err) => {
      req.url = originalURL;
      next(err);
    });
  };
  await ctx.nuxt.callHook("server:devMiddleware", viteMiddleware);
  ctx.nuxt.hook("close", async () => {
    await viteServer.close();
  });
}

const wpfs = {
  ...fsExtra__default['default'],
  join: upath.join
};

const DEFAULT_APP_TEMPLATE = `
<!DOCTYPE html>
<html {{ HTML_ATTRS }}>
<head {{ HEAD_ATTRS }}>
  {{ HEAD }}
</head>
<body {{ BODY_ATTRS }}>
  <div id="__nuxt">{{ APP }}</div>
  <script type="module" src="/@vite/client"></script>
  <script type="module" src="/client.js"></script>
</body>
</html>
`;
async function buildServer(ctx) {
  const _env = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const vuePlugin = vitePluginVue2.createVuePlugin(ctx.config.vue);
  process.env.NODE_ENV = _env;
  const alias = {};
  for (const p of ctx.builder.plugins) {
    alias[p.name] = p.mode === "client" ? `defaultexport:${path.resolve(ctx.nuxt.options.buildDir, "empty.js")}` : `defaultexport:${p.src}`;
  }
  const serverConfig = vite__namespace.mergeConfig(ctx.config, {
    define: {
      "process.server": true,
      "process.client": false,
      "typeof window": '"undefined"',
      "typeof document": '"undefined"',
      "typeof navigator": '"undefined"',
      "typeof location": '"undefined"',
      "typeof XMLHttpRequest": '"undefined"'
    },
    cacheDir: path.resolve(ctx.nuxt.options.rootDir, "node_modules/.cache/vite/server"),
    resolve: {
      alias
    },
    ssr: {
      external: [
        "axios"
      ],
      noExternal: [
        ...ctx.nuxt.options.build.transpile.filter((i) => typeof i === "string")
      ]
    },
    build: {
      outDir: "dist/server",
      ssr: true,
      rollupOptions: {
        input: path.resolve(ctx.nuxt.options.buildDir, "server.js"),
        onwarn(warning, rollupWarn) {
          if (!["UNUSED_EXTERNAL_IMPORT"].includes(warning.code)) {
            rollupWarn(warning);
          }
        }
      }
    },
    plugins: [
      jsxPlugin(),
      vuePlugin
    ]
  });
  await ctx.nuxt.callHook("vite:extendConfig", serverConfig, {isClient: false, isServer: true});
  const serverDist = path.resolve(ctx.nuxt.options.buildDir, "dist/server");
  await fsExtra.mkdirp(serverDist);
  const customAppTemplateFile = path.resolve(ctx.nuxt.options.srcDir, "app.html");
  const APP_TEMPLATE = await fsExtra.exists(customAppTemplateFile) ? (await fsExtra.readFile(customAppTemplateFile, "utf-8")).replace("{{ APP }}", '<div id="__nuxt">{{ APP }}</div>').replace("</body>", '<script type="module" src="/@vite/client"></script><script type="module" src="/client.js"></script></body>') : DEFAULT_APP_TEMPLATE;
  await fsExtra.writeFile(path.resolve(serverDist, "index.ssr.html"), APP_TEMPLATE);
  await fsExtra.writeFile(path.resolve(serverDist, "index.spa.html"), APP_TEMPLATE);
  await fsExtra.writeFile(path.resolve(serverDist, "client.manifest.json"), JSON.stringify({
    publicPath: "",
    all: [],
    initial: [
      "client.js"
    ],
    async: [],
    modules: {},
    assetsMapping: {}
  }, null, 2));
  await fsExtra.writeFile(path.resolve(serverDist, "server.manifest.json"), JSON.stringify({
    entry: "server.js",
    files: {
      "server.js": "server.js"
    },
    maps: {}
  }, null, 2));
  const onBuild = () => ctx.nuxt.callHook("build:resources", wpfs);
  if (!ctx.nuxt.options.ssr) {
    await onBuild();
    return;
  }
  const build = debounce__default['default'](async () => {
    const start = Date.now();
    await vite__namespace.build(serverConfig);
    await onBuild();
    consola__default['default'].info(`Server built in ${Date.now() - start}ms`);
  }, 300);
  await build();
  const watcher = chokidar.watch([
    ctx.nuxt.options.buildDir,
    ctx.nuxt.options.srcDir,
    ctx.nuxt.options.rootDir
  ], {
    ignored: [
      "**/dist/server/**"
    ]
  });
  watcher.on("change", () => build());
  ctx.nuxt.hook("close", async () => {
    await watcher.close();
  });
}

const PREFIX = "defaultexport:";
const hasPrefix = (id = "") => id.startsWith(PREFIX);
const removePrefix = (id = "") => hasPrefix(id) ? id.substr(PREFIX.length) : id;
const hasDefaultExport = (code = "") => code.includes("export default");
const addDefaultExport = (code = "") => code + "\n\nexport default () => {}";
function defaultExportPlugin() {
  return {
    name: "nuxt:default-export",
    enforce: "pre",
    resolveId(id, importer) {
      if (hasPrefix(id)) {
        return id;
      }
      if (importer && hasPrefix(importer)) {
        return this.resolve(id, removePrefix(importer));
      }
      return null;
    },
    async load(id) {
      if (hasPrefix(id)) {
        let code = await fsExtra.readFile(removePrefix(id), "utf8");
        if (!hasDefaultExport(code)) {
          code = addDefaultExport(code);
        }
        return {map: null, code};
      }
      return null;
    }
  };
}

function isObject(val) {
  return val !== null && typeof val === 'object';
} // Base function to apply defaults


function _defu(baseObj, defaults) {
  var namespace = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '.';
  var merger = arguments.length > 3 ? arguments[3] : undefined;

  if (!isObject(defaults)) {
    return _defu(baseObj, {}, namespace, merger);
  }

  var obj = Object.assign({}, defaults);

  for (var key in baseObj) {
    if (key === '__proto__' || key === 'constructor') {
      continue;
    }

    var val = baseObj[key];

    if (val === null) {
      continue;
    }

    if (merger && merger(obj, key, val, namespace)) {
      continue;
    }

    if (Array.isArray(val) && Array.isArray(obj[key])) {
      obj[key] = obj[key].concat(val);
    } else if (isObject(val) && isObject(obj[key])) {
      obj[key] = _defu(val, obj[key], (namespace ? "".concat(namespace, ".") : '') + key.toString(), merger);
    } else {
      obj[key] = val;
    }
  }

  return obj;
} // Create defu wrapper with optional merger and multi arg support


function extend(merger) {
  return function () {
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return args.reduce(function (p, c) {
      return _defu(p, c, '', merger);
    }, {});
  };
} // Basic version


var defu = extend(); // Custom version with function merge support

defu.fn = extend(function (obj, key, currentValue, _namespace) {
  if (typeof obj[key] !== 'undefined' && typeof currentValue === 'function') {
    obj[key] = currentValue(obj[key]);
    return true;
  }
}); // Custom version with function merge support only for defined arrays

defu.arrayFn = extend(function (obj, key, currentValue, _namespace) {
  if (Array.isArray(obj[key]) && typeof currentValue === 'function') {
    obj[key] = currentValue(obj[key]);
    return true;
  }
}); // Support user extending

defu.extend = extend;

var defu_1 = defu;

function resolveCSSOptions(nuxt) {
  const css = {
    postcss: {
      plugins: []
    }
  };
  const plugins = defu_1(nuxt.options.build.postcss.plugins, {
    "postcss-import": {
      resolve: createResolver__default['default']({
        alias: {...nuxt.options.alias},
        modules: [
          nuxt.options.srcDir,
          nuxt.options.rootDir,
          ...nuxt.options.modulesDir
        ]
      })
    },
    "postcss-url": {},
    "postcss-preset-env": nuxt.options.build.postcss.preset || {}
  });
  for (const name in plugins) {
    const opts = plugins[name];
    if (!opts) {
      continue;
    }
    const plugin = nuxt.resolver.requireModule(name);
    css.postcss.plugins.push(plugin(opts));
  }
  return css;
}

async function warmupViteServer(server, entries) {
  const warmedUrls = new Set();
  const warmup = async (url) => {
    if (warmedUrls.has(url)) {
      return void 0;
    }
    warmedUrls.add(url);
    try {
      await server.transformRequest(url);
    } catch (e) {
      consola__default['default'].debug("Warmup for %s failed with: %s", url, e);
    }
    const deps = Array.from(server.moduleGraph.urlToModuleMap.get(url).importedModules);
    await Promise.all(deps.map((m) => warmup(m.url)));
  };
  await Promise.all(entries.map((entry) => warmup(entry)));
}

async function bundle(nuxt, builder) {
  for (const p of builder.plugins) {
    p.src = nuxt.resolver.resolvePath(path.resolve(nuxt.options.buildDir, p.src));
  }
  const ctx = {
    nuxt,
    builder,
    config: vite__namespace.mergeConfig(nuxt.options.vite || {}, {
      root: nuxt.options.buildDir,
      mode: nuxt.options.dev ? "development" : "production",
      logLevel: "warn",
      define: {
        "process.dev": nuxt.options.dev
      },
      resolve: {
        extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".vue"],
        alias: {
          ...nuxt.options.alias,
          "~": nuxt.options.srcDir,
          "@": nuxt.options.srcDir,
          "web-streams-polyfill/ponyfill/es2018": require.resolve("./runtime/mock/web-streams-polyfill.mjs"),
          "abort-controller": require.resolve("./runtime/mock/abort-controller.mjs")
        }
      },
      vue: {},
      server: {
        fsServe: {
          strict: false
        }
      },
      css: resolveCSSOptions(nuxt),
      optimizeDeps: {
        exclude: [
          "ufo",
          "date-fns",
          "nanoid"
        ]
      },
      esbuild: {
        jsxFactory: "h",
        jsxFragment: "Fragment"
      },
      clearScreen: false,
      build: {
        emptyOutDir: false
      },
      plugins: [
        replace({
          __webpack_public_path__: "globalThis.__webpack_public_path__"
        }),
        jsxPlugin(),
        defaultExportPlugin()
      ]
    })
  };
  const i18nAlias = ctx.config.resolve.alias["~i18n-klona"];
  if (i18nAlias) {
    ctx.config.resolve.alias["~i18n-klona"] = i18nAlias.replace(".js", ".mjs");
  }
  await ctx.nuxt.callHook("vite:extend", ctx);
  ctx.nuxt.hook("vite:serverCreated", (server) => {
    const start = Date.now();
    warmupViteServer(server, ["/client.js"]).then(() => {
      consola__default['default'].info(`Vite warmed up in ${Date.now() - start}ms`);
    }).catch(consola__default['default'].error);
  });
  await buildClient(ctx);
  await buildServer(ctx);
}
class ViteBuilder {
  constructor(builder) {
    this.builder = builder;
    this.nuxt = builder.nuxt;
  }
  build() {
    return bundle(this.nuxt, this.builder);
  }
}

exports.ViteBuilder = ViteBuilder;
