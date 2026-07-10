/// <reference types="vite/client" />

// Vite ?worker 导入语法类型声明
declare module '*?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
