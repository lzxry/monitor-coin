# 加密货币监控移动端应用

这是一个基于 Vue 3 + TypeScript + Vite 开发的加密货币监控移动端应用。

## 技术栈

- Vue 3.5.13
- TypeScript
- Vant UI 4.9.17
- Vite 6.2.0

## 开发环境要求

- Node.js >= 16
- npm >= 7

## 项目设置

### 安装依赖

```bash
npm install
```

### 开发环境运行

```bash
npm run dev
```

### 生产环境构建

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 项目结构

```
monitor-coin-mobile/
├── src/                # 源代码目录
│   ├── assets/        # 静态资源
│   ├── components/    # Vue 组件
│   ├── App.vue        # 根组件
│   └── main.ts        # 应用入口
├── public/            # 公共资源目录
├── vite.config.ts     # Vite 配置
└── tsconfig.json      # TypeScript 配置
```

## 开发指南

- 使用 `<script setup>` 语法进行组件开发
- 使用 TypeScript 进行类型检查
- 使用 Vant UI 组件库进行界面开发

## 部署

项目支持部署到 Vercel 平台，配置文件位于 `vercel.json`。

## 相关文档

- [Vue 3 文档](https://v3.vuejs.org/)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [Vant UI 文档](https://vant-ui.github.io/vant/#/zh-CN)
- [Vite 文档](https://vitejs.dev/)
