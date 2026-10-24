/**
 * 数据源的打开逻辑：从 `dsh/index.js` 里抽出来，只依赖 store / demo / workbench，
 * **不 import schemastery**。目的有二：
 *
 * 1. 这本是"装进宿主"最容易出故障的一段（目录、库文件、种子数据），抽出来才测得动——
 *    `dsh/index.js` 要 `@deepseek-ai/schemastery`，那是宿主运行时给的包，仓库里没装，
 *    单测一 import 整个文件就 ERR_MODULE_NOT_FOUND（见 test/plugin.test.mjs 的注释）。
 * 2. 让"开库前先建目录"这条约束集中在一个文件里，扩散到其它病种时照抄这一份。
 */
import { mkdirSync } from 'node:fs'
import { openDatabase, migrate } from './store.js'
import { seedDemo, hasDemoData } from './demo.js'
import { Workbench } from './workbench.js'

/** 装进 Desktop 时的会话形态。customFrame=true 后原生会话由面板外壳（lib/client.js）
 *  排在业务区右侧，页面里那份自绘会话栏必须停用——两份并排就是用户看到的"位置错误"。
 *  available:false 是给页面看的开关；mode:'host' 让页面把整组会话控件收起来，不留一个灰按钮。 */
export const HOST_AGENT = Object.freeze({
  available: false,
  mode: 'host',
  note: '会话在右侧由宿主面板提供：点顶栏「AI 对话」调起；本页「整理本页要点」会把草稿填进那个输入框。',
})

/**
 * 打开（必要时创建）资料目录里的库，返回 Workbench。
 *
 * `root` 由 cordis.patch.yml 的 `dshHomePath('attr-workbench')` 注入。**不给就报错**，
 * 不悄悄退到内存库：那样用户装完能用、重启后数据全没，报错至少说清了原因。
 */
export function openDataSource(root) {
  const dir = root ? String(root).replace(/\/+$/, '') : null
  if (!dir) throw new Error('缺少资料目录：cordis.patch.yml 的 config.root 未注入')
  /* 宿主的 dshHomePath 只是**拼出路径**，不会替你建目录（2026-10-24 真机实证：
     `~/Library/Application Support/dsh-desktop/harness/attr-workbench` 整条不存在，
     SQLite 在不存在的目录里建不了文件，界面直接报「打不开数据库」）。
     所以开库前自己 recursive 建一次；建不动就报清是哪一层，不把 ENOENT 原样抛给用户。 */
  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    throw new Error(`建不了资料目录：${dir}（${error.code || error.message}）`)
  }
  const db = openDatabase(`${dir}/xyb-attr.sqlite`)
  migrate(db)
  if (!hasDemoData(db)) seedDemo(db)
  return Workbench.fromDatabase(db, { workspace: dir, agent: HOST_AGENT })
}
