/* 工作台实例：把「工作区目录 → 库 → 读模型」串起来。
 *
 * 与 DSH 插件入口（dsh/index.js）分开的原因：入口必须 import 宿主给的 peer 依赖
 * （Schemastery），本仓库装不上，一 import 就炸。所以可单测的那一层放这里，
 * `npm start -- --workspace <目录>` 与将来的宿主 apply() 用的是同一个类。
 *
 * 规则（与乳腺癌 / 食管癌工作台一致）：
 * - 资料目录由用户选定，不猜、不静默创建；
 * - 打开即 migrate，只补未执行的迁移；
 * - 库里没有档案时才播种演示数据，之后每次启动都沿用用户自己的资料。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { close, migrate, openDatabase } from './store.js';
import { hasDemoData, seedDemo } from './demo.js';
import { bootstrap, bpRows, getProfile, listSubjects } from './readmodels.js';
import { addBpRow } from './writes.js';
import { exportSummaryText } from './export.js';
import { workspaceProblems } from './server.js';
import { version, build, displayVersion } from '../lib/version.js';

export const DB_FILE = 'xyb-attr.sqlite';

/** 校验资料目录：返回问题数组（空数组＝可用）。不抛错，方便 UI 一次性列出所有问题。 */
export function validateWorkspacePath(p) {
  return workspaceProblems(p);
}

export class Workbench {
  #db = null;
  #workspace = null;

  /** 打开（必要时创建）工作区里的库。workspace 必须已经通过 validateWorkspacePath。 */
  static async open(workspace) {
    const problems = validateWorkspacePath(workspace);
    if (problems.length) throw new Error(problems.join('；'));

    let dir = workspace;
    if (!existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }); } catch (error) {
        throw new Error(`建不了资料目录 ${dir}：${error.message}`);
      }
    }

    const wb = new Workbench();
    wb.#workspace = dir;
    wb.#db = openDatabase(join(dir, DB_FILE));
    try {
      migrate(wb.#db);
      if (!hasDemoData(wb.#db)) seedDemo(wb.#db);
    } catch (error) {
      try { close(wb.#db); } catch { /* 关不掉也要把原始错误抛出去 */ }
      throw error;
    }
    return wb;
  }

  get version() { return version; }
  get displayVersion() { return displayVersion; }
  get build() { return build; }
  get workspace() { return this.#workspace; }
  get db() { return this.#db; }

  bootstrap() { return bootstrap(this.#db, { version, build }); }
  listSubjects() { return listSubjects(this.#db); }
  getProfile(key) { return getProfile(this.#db, key); }

  /**
   * 写一条血压记录（体位性低血压）。单条 INSERT 也走事务：日后同一支写入要连带写
   * 来源文档或候选状态时，事务边界已经在这儿了，不必回头改调用方。
   * 校验失败抛 ValidationError（writes.js），由 server.js 转 400 + 字段名。
   */
  addBp(input) {
    const db = this.#db;
    db.exec('BEGIN');
    try {
      const row = addBpRow(db, input);
      db.exec('COMMIT');
      return row;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* 回滚失败也要把原始错误抛出去 */ }
      throw error;
    }
  }

  /** 某个档案的血压记录（读模型形状：7 位元组数组，与原型一致）。 */
  bpRows(profileKey) { return bpRows(this.#db, profileKey); }

  /** 门诊摘要导出（家系与看法按构造排除，见 dsh/export.js 头注释）。 */
  exportSummary(profileKey) { return exportSummaryText(this.#db, profileKey); }

  close() {
    if (this.#db) { close(this.#db); this.#db = null; }
  }
}
