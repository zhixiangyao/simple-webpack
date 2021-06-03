# mini webpack 实现

- @babel/parser 用于解析源代码，产出 AST
- @babel/traverse 用于遍历 AST，找到 require 语句并修改成 _require_，将引入路径改造为相对根的路径
- @babel/core 用于将修改后的 AST 转换成新的代码输出
