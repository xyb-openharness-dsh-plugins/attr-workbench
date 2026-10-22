/* ATTR 工作台 · 0003：导入链路需要的三块结构。
 *
 * 为什么必须新开迁移：0001 已冻结（sha256 在 schema/freeze-contract.md），
 * 0002 也已执行。导入是阶段 2 才定下来的流程，不能回改历史文件。
 *
 * 三块：
 * 1. `parse_jobs`——每触发一次解析就一条记录，**失败记录永远留着**（A2：重试不重置历史）。
 *    界面靠它显示「解析中 / 失败可重试 / 成功待核对」三态，以及错误码与原文。
 * 2. `documents` 补 `sha256` / `rel_path` / `pages`——去重靠（主体, 文件哈希），
 *    原件路径只存**相对资料目录**的路径（不落绝对路径，导出与截图都不会泄露本机目录）。
 * 3. `candidate_fields` 补 `doc_id` / `metric_key` / `unit` / `value_num` / `value_text`。
 *    原表只有 (name, value, source, status)，接受候选时无法知道"这个值属于哪个指标、
 *    什么单位、是不是不等式"——靠名字反查词典属于二次猜测，抄写层不做第二次解释。
 *
 * 只加列、不加 NOT NULL、不给默认值：ALTER TABLE 不支持"NOT NULL 且无默认值"，
 * 而这些列对历史行本来就是"没有这个信息"，NULL 正是正确的语义。
 */

CREATE TABLE parse_jobs (
  profile_key   TEXT,
  id            TEXT,
  doc_id        TEXT,
  status        TEXT,             -- queued / running / succeeded / failed
  engine        TEXT,             -- mineru-api-v4
  model         TEXT,             -- pipeline / vlm
  batch_id      TEXT,
  pages         INTEGER,
  error_code    TEXT,             -- NO_TOKEN / TASK_FAILED / BAD_ZIP / NO_MARKDOWN …
  error_message TEXT,
  started_at    TEXT,
  finished_at   TEXT,
  ord           INTEGER,
  PRIMARY KEY (profile_key, id),
  CHECK (status IN ('queued','running','succeeded','failed'))
);

ALTER TABLE documents ADD COLUMN sha256 TEXT;
ALTER TABLE documents ADD COLUMN rel_path TEXT;
ALTER TABLE documents ADD COLUMN pages INTEGER;

ALTER TABLE candidate_fields ADD COLUMN doc_id TEXT;
ALTER TABLE candidate_fields ADD COLUMN metric_key TEXT;
ALTER TABLE candidate_fields ADD COLUMN unit TEXT;
ALTER TABLE candidate_fields ADD COLUMN value_num REAL;
ALTER TABLE candidate_fields ADD COLUMN value_text TEXT;
