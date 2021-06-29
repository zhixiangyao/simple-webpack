const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const babel = require('@babel/core')

// 保存根路径，所有模块根据根路径产出相对路径
const root = process.cwd()

/**
 * 读取模块信息
 * @param {string} filePath
 * @return {{code: string, deps: string[], filePath: string}}
 */
function readModuleInfo(filePath) {
  // 准备好相对路径作为 module 的 key
  filePath = './' + path.relative(root, path.resolve(filePath)).replace(/\\+/g, '/')
  // 读取源码
  const content = fs.readFileSync(filePath, 'utf-8')
  // 转换出 AST
  const ast = parser.parse(content)
  // 遍历模块 AST，将依赖收集到 deps 数组中
  const deps = []
  traverse(ast, {
    CallExpression: ({ node }) => {
      // 如果是 require 语句，则收集依赖
      if (node.callee.name === 'require') {
        // 改造 require 关键字
        node.callee.name = '_require_'
        let moduleName = node.arguments[0].value
        moduleName += path.extname(moduleName) ? '' : '.js'
        moduleName = path.join(path.dirname(filePath), moduleName)
        moduleName = './' + path.relative(root, moduleName).replace(/\\+/g, '/')
        deps.push(moduleName)
        // 改造依赖的路径
        node.arguments[0].value = moduleName
      }
    },
  })
  // 编译回代码
  const { code } = babel.transformFromAstSync(ast)
  return {
    filePath,
    deps,
    code,
  }
}

/**
 * 构建依赖图
 * @param {string} entry
 * @returns {{code: string, deps: string[], filePath: string}[]}
 */
function buildDependencyGraph(entry) {
  // 获取入口模块信息
  const entryInfo = readModuleInfo(entry)
  // 项目依赖树
  const graphArr = []
  graphArr.push(entryInfo)
  // 从入口模块触发，递归地找每个模块的依赖，并将每个模块信息保存到 graphArr
  for (const module of graphArr) {
    module.deps.forEach(depPath => graphArr.push(readModuleInfo(path.resolve(depPath))))
  }
  return graphArr
}

/**
 * 打包
 * @param {{code: string, filePath: string}[]} graph
 * @param {string} entry
 * @returns {string}
 */
function pack(graph, entry) {
  const moduleArr = graph.map(module => {
    const { filePath, code } = module
    return `
  "${filePath}": function (module, exports, _require_) {
    eval(\`${code.replace(/\n/gi, '')}\`)
  }`.trim()
  })

  const output = `
;(modules => {
  var modules_cache = {}
  var _require_ = function (module_id) {
    if (modules_cache[module_id]) return modules_cache[module_id].exports
    var module = (modules_cache[module_id] = {
      exports: {},
    })
    modules[module_id](module, module.exports, _require_)
    return module.exports
  }

  _require_("${entry}")
})({
  ${moduleArr}
})`.trim()

  return output
}

function main(entry = './src/index.js', output = './dist/index.js') {
  fs.writeFileSync(output, pack(buildDependencyGraph(entry), entry))
}

main()
