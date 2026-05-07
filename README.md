# Telos - AI 驱动的定制化学习平台

Telos 是一个 AI 驱动的个性化学习平台。告诉我们你想学什么，AI 将为你生成完整的、结构化的学习课程。

## 特性

- **目标驱动**: 设定学习目标和深度，AI 根据需求定制内容
- **异步生成**: 提交学习任务后后台自动生成，完成后即可学习
- **开箱即学**: 生成的课程拥有专业的章节布局，支持代码高亮、数学公式
- **RAG 增强**: 上传你的资料（PDF/文本），AI 会参考这些内容生成课程

## 技术栈

### 前端
- Next.js 15 (App Router)
- Tailwind CSS
- shadcn/ui
- React Query
- react-markdown + KaTeX

### 后端
- Python FastAPI
- SQLAlchemy + SQLite
- LanceDB (向量存储)
- DeepSeek API

## 快速开始

### 前置要求

- Node.js 18+
- Python 3.11+
- DeepSeek API Key

### 1. 克隆项目

```bash
git clone <repository-url>
cd telos
```

### 2. 配置环境变量

```bash
# 后端配置
cd server
cp .env.example .env
# 编辑 .env 填入你的 DeepSeek API Key
```

### 3. 启动后端

```bash
cd server

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m app.main
# 或
uvicorn app.main:app --reload --port 8000
```

### 4. 启动前端

```bash
cd web

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 5. 访问应用

打开浏览器访问 http://localhost:3000

## 使用流程

1. **创建学习任务**: 描述你想学习的内容，设定学习目标和深度
2. **上传资料** (可选): 上传相关的 PDF 或文本文件
3. **开始生成**: 点击"开始生成"，AI 将在后台生成课程
4. **开始学习**: 生成完成后，进入学习工作站开始学习

## 项目结构

```
telos/
├── web/                    # Next.js 前端
│   ├── src/
│   │   ├── app/           # 页面路由
│   │   ├── components/    # React 组件
│   │   └── lib/           # 工具函数
│   └── package.json
│
├── server/                 # Python 后端
│   ├── app/
│   │   ├── routers/       # API 路由
│   │   ├── services/      # 业务逻辑
│   │   ├── models/        # 数据模型
│   │   └── db/            # 数据库
│   └── requirements.txt
│
├── data/                   # 数据存储
│   ├── telos.db           # SQLite 数据库
│   ├── vectors/           # LanceDB 向量库
│   └── uploads/           # 上传文件
│
└── docs/                   # 文档
```

## API 端点

### Blocks (学习任务)
- `GET /api/blocks` - 获取任务列表
- `POST /api/blocks` - 创建任务
- `GET /api/blocks/{id}` - 获取任务详情
- `PUT /api/blocks/{id}` - 更新任务
- `DELETE /api/blocks/{id}` - 删除任务
- `POST /api/blocks/{id}/generate` - 开始生成课程
- `GET /api/blocks/{id}/status` - 获取生成状态

### Courses (课程)
- `GET /api/courses` - 获取课程列表
- `GET /api/courses/{id}` - 获取课程详情（含章节）
- `DELETE /api/courses/{id}` - 删除课程

### Uploads (附件)
- `POST /api/blocks/{id}/attachments` - 上传附件
- `GET /api/blocks/{id}/attachments/{aid}/download` - 下载附件
- `DELETE /api/blocks/{id}/attachments/{aid}` - 删除附件

## 配置说明

### DeepSeek API

在 `server/.env` 中配置:

```env
DEEPSEEK_API_KEY=your_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

### 学习深度

- **快速了解** (quick_overview): 3-4 章节，掌握核心概念
- **标准学习** (standard): 5-7 章节，全面覆盖主题
- **深入研究** (deep_dive): 8-12 章节，深度技术细节

## License

MIT
