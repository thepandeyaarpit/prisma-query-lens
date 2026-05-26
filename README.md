# 🔍 Query Lens v1.4.0

**Visualize and Optimize Prisma Query Execution Flows in Real-Time.**

Query Lens is a powerful developer tool that analyzes your codebase to find every Prisma query triggered by a specific function, including all sub-functions and nested calls. It provides both an interactive visual graph and a detailed list view to help you identify performance bottlenecks like N+1 risks.

---

## 🆕 Recent CLI Upgrades & Updates (v1.4.0)

Query Lens has been upgraded with a powerful, developer-friendly **Interactive CLI Optimizer & Autofixer**!

### ⚡ Key Interactive CLI Additions:

- **Interactive CLI REPL**:
  Launch the CLI tool in any target project terminal with `query-lens --cli` to search queries and inspect optimizations inside a live REPL.
- **Deterministic Offline N+1 Loop Batching Auto-Fixer**:
  No API keys required! Query Lens features a highly sophisticated AST transformation engine. When you run `use query <id> and auto-fix` on an N+1 loop warning, it automatically rewrites performance-bottlenecked loops, moves individual Prisma calls out of loops, batches primary keys (like UUIDs/IDs), and implements bulk operations like `updateMany` or `findMany` with `in` filters.
- **Restored Grok AI Optimization & Autofixer (Optional)**:
  Integrate your xAI Grok API key inside a global `.env` file to leverage advanced context-aware AI rewrites on complex query blocks.
- **Global Key Configurations**:
  Configure your developer credentials once inside the Query Lens tool folder (`query-lens-web/.env`) to use the credentials across all project workspaces seamlessly.
- **Premium Clean Local Fallback**:
  Beautiful, developer-friendly UX fallback indicators silence complex error stacks during network or billing limitations, providing a polished terminal feel.

---

## 🚀 Key Features

### 📊 Interactive Execution Graph

- **Visual Flow**: See your entire execution path mapped out as a directed graph.
- **Intelligent Highlighting**: Click any node to highlight its downstream children and fade out unrelated paths.
- **Interactive MiniMap**: Navigate complex graphs with ease using the pannable and zoomable mini-map.
- **Auto-Layout**: Built-in `dagre` layout engine ensures clean, readable graphs regardless of complexity.

### 📜 Classic List View

- **Structured Metadata**: View exact line numbers, file paths, and call depths for every query.
- **Operation Insights**: Color-coded badges for different operation types (Read, Create, Update, Delete, Raw).
- **SQL Inspection**: View the generated SQL for any Prisma query with one click.

### ⚡ Performance & Optimization

- **N+1 Detection**: Automatic visual warnings for queries running inside loops (N+1 risks).
- **Optimization Suggestions**: Get actionable advice on adding `select`, `take`, or `skip` to improve performance.
- **Persistence**: Shared state across views ensures your analysis remains intact when switching between Graph and List modes.

### 🌍 Universal Access

- **Terminal Integration**: Run `query-lens` from the terminal of any project to start the analyzer instantly.
- **Browser-Based UI**: Access all features through a sleek, modern web interface with zero configuration required.

---

## ⚙️ Setup & Usage

### 🌎 Global Installation (Recommended)

You can install Query Lens globally to use it anywhere on your machine:

```bash
npm install -g @appu2778/prisma-query-lens
```

Once installed, simply run:

```bash
query-lens
```

### 🛠️ Local Development Setup

1. **Clone & Install**:

```bash
npm install
```

2. **Launch**:

```bash
npm start
```

Open your browser at `http://localhost:4242`

---

## 📖 How to Use

1.  **Function Name**: Enter the name of the function you want to analyze (e.g., `automaticMessage`).
2.  **File Path**: Provide the **full absolute path** to the file containing that function.
    - **Windows Example**: `D:\myproject\src\services\automatic-message.ts`
    - **Mac/Linux Example**: `/home/user/myproject/src/services/automatic-message.ts`
3.  **Workspace Root**: (Optional) Provide the root folder of your project where `package.json` resides.
4.  **Analyze**: Click the **Analyze** button to start the scan.

---

## 📈 Analytics & Data Points

| Column                | Description                                                            |
| :-------------------- | :--------------------------------------------------------------------- |
| **Total Queries**     | Every Prisma query found across all sub-functions in the call chain.   |
| **N+1 Risks**         | Critical count of queries identified inside loops or iterative blocks. |
| **Models**            | All Prisma models touched during the execution of the target function. |
| **Functions Scanned** | The full depth of the call chain followed during analysis.             |
| **Max Depth**         | The maximum recursion depth reached by the static analysis engine.     |

### Detailed Query Cards

In the Classic List View, each card provides:

- **Prisma Method**: Precise method used (`findMany`, `create`, `upsert`, etc.).
- **Model Name**: The target database model.
- **Query Arguments**: Full visibility into `where`, `select`, `include`, and pagination options.
- **Location**: The exact function name and line number in the source file.
- **Generated SQL**: Direct access to the raw SQL output (click "Show SQL").

---

## 🏷️ Keywords

`prisma` `query` `analyzer` `static-analysis` `typescript` `n+1` `sql`

---

## 🛡️ License

Built with ❤️ by **Arpit Pandeya** for the Prisma Developer Community. MIT License.
# prisma-query-lens
