/**
 * 把插件打包成 dsh 可加载的两半：
 *   lib/index.js  —— Node 半（ESM，供宿主 Loader 挂载）
 *   lib/client.js —— 浏览器半（闭包工厂，经 window.__ModuleLoader__.load 注册）
 * three.js 打进客户端包；react / react-dom 走宿主的模块表。
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const id = pkg.name

const cssInline = {
  name: 'evoverse-css-inline',
  setup(context) {
    context.onLoad({ filter: /\.css$/ }, async args => {
      const css = await readFile(args.path, 'utf8')
      return {
        contents: [
          `const style = document.createElement('style');`,
          `style.dataset.plugin = ${JSON.stringify(id)};`,
          `style.textContent = ${JSON.stringify(css)};`,
          `document.head.appendChild(style);`,
          `export default ${JSON.stringify(css)};`,
        ].join('\n'),
        loader: 'js',
      }
    })
  },
}

const shared = {
  bundle: true,
  write: false,
  logLevel: 'info',
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
  },
}

const nodeResult = await build({
  ...shared,
  entryPoints: [join(root, 'src/index.ts')],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/*'],
})

const clientResult = await build({
  ...shared,
  entryPoints: [join(root, 'src/client/index.ts')],
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/*'],
  plugins: [cssInline],
})

const clientBody = clientResult.outputFiles[0].text
const wrapped = [
  `window.__ModuleLoader__.load({`,
  `  id: ${JSON.stringify(id)},`,
  `  factory: (require) => {`,
  `    var module = { exports: {} };`,
  `    var exports = module.exports;`,
  clientBody,
  `    return module.exports;`,
  `  },`,
  `});`,
  ``,
].join('\n')

await mkdir(join(root, 'lib'), { recursive: true })
await writeFile(join(root, 'lib/index.js'), nodeResult.outputFiles[0].text)
await writeFile(join(root, 'lib/client.js'), wrapped)
console.log(`built ${id}: lib/index.js + lib/client.js`)
