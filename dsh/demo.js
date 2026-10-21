/* 演示数据播种（ATTR）。
 *
 * 唯一数据源是 `demo/build-demo-data.mjs` 的 `buildDemoProfiles()`（两个产物
 * prototypes/v0.2/demo-data.js 与 demo/demo-data.sqlite 也从它生成）。这里只是把同一份纯数据
 * 写进**用户资料目录里那个库**，不新增、不改写任何数值——演示数据一旦在这里多出一条，
 * 原型与开发版就会各说一套。
 *
 * 幂等：库里已经有 subjects 就整批跳过（开发版启动时可能跑很多次，不能每次都复制一份档案）。
 * 事务：整批在一个事务里，中途失败整体回滚，不留"半个档案"。
 *
 * 与食管癌 seedDemo 的差异只在业务表：pathway_rows / swallow_rows / nutrition_rows … 换成
 * ATTR 的 genotype_rows / phenotype_rows / stage_rows / diagnosis_rows / cardiac_rows /
 * echo_rows / rhythm_events / bp_rows / neuro_rows / autonomic_rows / redflag_rows /
 * drug_rows / tolerance_rows / family_rows / counsel_rows / daily_rows（schema/0001_initial.sql）。
 *
 * 三个字段口径（H6 的教训，别图省事）：
 * 1. 所有 INSERT 写显式列名 + 显式问号数，不用位置式 VALUES；
 * 2. 原型里绝大多数业务表是**定长元组数组**，按 r[0]…r[n] 取，不要写 r.item（那是食管癌的对象形状）；
 * 3. genotype 是唯一的单行对象表，按字段名取；野生型档案也有一行（kind='wildtype'）。
 */

import { buildDemoProfiles } from '../demo/build-demo-data.mjs';

const j = (v) => (v === undefined ? null : JSON.stringify(v));
const flag = (v) => (v ? 1 : 0);

/** 把 buildDemoProfiles() 的数据写进库。返回写入计数（便于启动日志与测试）。 */
export function seedDemo(db, input) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('seedDemo 需要一个已打开的数据库');
  const data = input || buildDemoProfiles();

  const already = db.prepare('SELECT COUNT(*) AS n FROM subjects').get().n;
  if (already > 0) return { skipped: true, subjects: 0, metrics: 0, points: 0, trials: 0 };

  const counts = { skipped: false, subjects: 0, metrics: 0, points: 0, trials: 0 };

  db.exec('BEGIN');
  try {
    /* 列名顺序与 schema/0001_initial.sql 一致；按位置写会因为列数不匹配直接报错（这是想要的）。 */
    const insSubject = db.prepare(`INSERT INTO subjects
      (profile_key, name, sex, age, meta, headline, stage, mindset, dash_keys, path,
       activity, family_talk, genotype_title, phenotype_title, stage_title, diagnosis_title,
       cardiac_title, echo_title, bp_title, neuro_title, autonomic_title, redflag_title,
       drug_title, tolerance_title, family_title, counsel_title, daily_title)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insMetric = db.prepare(`INSERT INTO metrics (profile_key,key,name,unit,cat,color,dec,kind,band_low,band_high,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const insPoint = db.prepare('INSERT INTO metric_points (profile_key,metric_key,d,v_num,v_text,src,ord) VALUES (?,?,?,?,?,?,?)');
    const insGroup = db.prepare('INSERT INTO metric_groups (profile_key,grp,label,ord) VALUES (?,?,?,?)');
    const insEvent = db.prepare('INSERT INTO events (profile_key,d,label,kind) VALUES (?,?,?,?)');
    const insRhythm = db.prepare('INSERT INTO rhythm (profile_key,item,freq,guideline,last,next,ord) VALUES (?,?,?,?,?,?,?)');
    const insMonitor = db.prepare('INSERT INTO monitor_rows (profile_key,item,freq,last,next,note,ord) VALUES (?,?,?,?,?,?,?)');
    const insVP = db.prepare('INSERT INTO viewpoints (profile_key,d,mood,text,private,ord) VALUES (?,?,?,?,?,?)');
    const insDoc = db.prepare('INSERT INTO documents (profile_key,id,name,date,type,status,ord) VALUES (?,?,?,?,?,?,?)');
    const insCand = db.prepare('INSERT INTO candidate_fields (profile_key,id,name,value,source,status,ord) VALUES (?,?,?,?,?,?,?)');
    const insGeno = db.prepare(`INSERT INTO genotype_rows
      (profile_key,kind,variant,zygosity,method,lab,report_date,doctor_text,state,revision_of,superseded,ord)
      VALUES (?,?,?,?,?,?,?,?,?,NULL,0,0)`);
    const insPheno = db.prepare('INSERT INTO phenotype_rows (profile_key,item,value,note,ord) VALUES (?,?,?,?,?)');
    const insStage = db.prepare('INSERT INTO stage_rows (profile_key,scheme,value,d,by_who,doctor_text,ord) VALUES (?,?,?,?,?,?,?)');
    const insDiag = db.prepare('INSERT INTO diagnosis_rows (profile_key,step,state,finding,d,institution,doctor_text,ord) VALUES (?,?,?,?,?,?,?,?)');
    const insCardiac = db.prepare('INSERT INTO cardiac_rows (profile_key,d,symptom,severity,note,self,ord) VALUES (?,?,?,?,?,1,?)');
    const insEcho = db.prepare(`INSERT INTO echo_rows
      (profile_key,d,kind,ivsd,lvpwd,lvef,gls,lge,finding,institution,ord) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const insRhythmEvent = db.prepare('INSERT INTO rhythm_events (profile_key,d,kind,detail,action,ord) VALUES (?,?,?,?,?,?)');
    const insBp = db.prepare('INSERT INTO bp_rows (profile_key,d,position,sys,dia,pulse,symptom,drug_note,ord) VALUES (?,?,?,?,?,?,?,?,?)');
    const insNeuro = db.prepare('INSERT INTO neuro_rows (profile_key,d,domain,symptom,severity,note,self,ord) VALUES (?,?,?,?,?,?,1,?)');
    const insAuto = db.prepare('INSERT INTO autonomic_rows (profile_key,d,domain,symptom,detail,self,ord) VALUES (?,?,?,?,?,1,?)');
    const insFlag = db.prepare('INSERT INTO redflag_rows (profile_key,phase,item,year,side,note,ord) VALUES (?,?,?,?,?,?,?)');
    const insDrug = db.prepare(`INSERT INTO drug_rows
      (profile_key,name,mechanism,dose,schedule,start,end,status,reason,doctor_text,ord) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const insTol = db.prepare('INSERT INTO tolerance_rows (profile_key,d,drug,kind,detail,action,ord) VALUES (?,?,?,?,?,?,?)');
    const insFam = db.prepare('INSERT INTO family_rows (profile_key,rel,label,tested,result,note,private,ord) VALUES (?,?,?,?,?,?,?,?)');
    const insCounsel = db.prepare('INSERT INTO counsel_rows (profile_key,d,institution,who,topic,doctor_text,ord) VALUES (?,?,?,?,?,?,?)');
    const insDaily = db.prepare('INSERT INTO daily_rows (profile_key,d,kind,detail,amount,symptom,note,ord) VALUES (?,?,?,?,?,?,?,?)');
    const insTrial = db.prepare('INSERT INTO trials (record_id,source,title,status,note,saved,ord) VALUES (?,?,?,?,?,?,?)');
    const insMeta = db.prepare('INSERT INTO demo_meta (k,v) VALUES (?,?)');

    for (const [key, p] of Object.entries(data.profiles)) {
      const isVariant = p.genotype.kind === 'variant';
      insSubject.run(key, p.name, p.sex, p.age, p.meta, p.headline, p.stage, p.mindset,
        j(p.dash_keys), j(p.path), p.activity, p.familyTalk,
        /* 分节标题：野生型没有 genotype_title（H1：型别不是标签，是两条不同的病） */
        isVariant ? '型别与基因' : null, '表型与分期', '分期记录', '确诊路径', '心衰症状与体征',
        '心超与影像', '血压与用药耐受', '感觉与运动', '自主神经', '腕管与脊柱', '当前方案',
        '用药与耐受', '家系图', '遗传咨询记录', '饮食与体重');
      counts.subjects++;

      for (const m of p.metrics) {
        insMetric.run(key, m.key, m.name, m.unit, m.cat, m.color, m.dec, m.kind, m.band_low, m.band_high, m.note);
        counts.metrics++;
        for (const [pi, pt] of (m.points || []).entries()) {
          /* 原型 points 是 {d, v_num, v_text, src}；数值与文字互斥由 schema 的 CHECK 保证 */
          insPoint.run(key, m.key, pt.d, pt.v_num ?? null, pt.v_text ?? null, pt.src ?? null, pi);
          counts.points++;
        }
      }
      for (const [grp, label, ord] of [['heart', '心脏', 1], ['kidney', '肾脏', 2], ['blood', '体重与血液', 3], ['neuro', '神经', 4]]) {
        insGroup.run(key, grp, label, ord);
      }

      (p.events || []).forEach(([d, label]) => insEvent.run(key, d, label, /起病|确诊|级|基因/.test(label) ? 'diagnosis' : 'event'));
      /* rhythmRows = [项目, 频率, 依据, 上次, 下次]；last 列由 0002 迁移追加 */
      (p.rhythmRows || []).forEach((r, i) => insRhythm.run(key, r[0], r[1], r[2], r[3] ?? null, r[4] ?? null, i));
      (p.monitor || []).forEach((r, i) => insMonitor.run(key, r[0], r[1], r[2] ?? null, r[3] ?? null, null, i));
      (p.viewpoints || []).forEach((v, i) => insVP.run(key, v[0], v[1], v[2], 0, i));
      (p.docs || []).forEach((d, i) => insDoc.run(key, d[0], d[1], d[2], d[3], d[4], i));
      (p.candidates || []).forEach((c, i) => insCand.run(key, c[0], c[1], c[2], c[3], c[4], i));

      const g = p.genotype;
      if (g) {
        insGeno.run(key, g.kind, g.variant, g.zygosity, g.method, g.lab, g.reportDate, g.doctorText, g.state);
      }

      (p.phenotype || []).forEach((r, i) => insPheno.run(key, r[0], r[1], r[2], i));
      (p.stages || []).forEach((r, i) => insStage.run(key, r[0], r[1], r[2], r[3], r[4], i));
      /* H5：state 不是 done 时 finding 必须是 NULL（schema CHECK），未做 ≠ 阴性 */
      (p.diagnosis || []).forEach((r, i) => insDiag.run(key, r[0], r[1], r[2] ?? null, r[3], r[4], r[5], i));
      (p.cardiac || []).forEach((r, i) => insCardiac.run(key, r[0], r[1], r[2], r[3], i));
      (p.echo || []).forEach((r, i) => insEcho.run(key, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], i));
      (p.rhythmEvents || []).forEach((r, i) => insRhythmEvent.run(key, r[0], r[1], r[2], r[3], i));
      (p.bp || []).forEach((r, i) => insBp.run(key, r[0], r[1], r[2], r[3], r[4], r[5], r[6], i));
      (p.neuro || []).forEach((r, i) => insNeuro.run(key, r[0], r[1], r[2], r[3], r[4], i));
      (p.autonomic || []).forEach((r, i) => insAuto.run(key, r[0], r[1], r[2], r[3], i));
      (p.redflags || []).forEach((r, i) => insFlag.run(key, r[0], r[1], r[2], r[3], r[4], i));
      (p.drugs || []).forEach((r, i) => insDrug.run(key, r[0], r[1], r[2], r[3], r[4], r[5] ?? null, r[6], r[7], r[8], i));
      (p.tolerance || []).forEach((r, i) => insTol.run(key, r[0], r[1], r[2], r[3], r[4], i));
      /* family_rows.private 默认 1（H3：家系信息是全站最高敏感级）；原型第 6 位就是它 */
      (p.family || []).forEach((r, i) => insFam.run(key, r[0], r[1], r[2], r[3], r[4], r[5] ?? 1, i));
      (p.counsel || []).forEach((r, i) => insCounsel.run(key, r[0], r[1], r[2], r[3], r[4], i));
      /* daily 原型 5 位，schema 多一个 note 列（真实录入用），演示数据没有 → NULL */
      (p.daily || []).forEach((r, i) => insDaily.run(key, r[0], r[1], r[2], r[3], r[4], r[5] ?? null, i));
    }

    for (const [i, t] of (data.trials || []).entries()) {
      const r = insTrial.run(t.record_id, t.source, t.title, t.status, t.note, t.saved, i);
      if (r && r.changes) counts.trials++;
    }

    /* demo_meta：前端 D.meta 直接用它推时间窗，键名与 demo-data.js 的 meta 一致 */
    const meta = data.meta || {};
    for (const k of ['version', 'build', 'windowStart', 'windowEnd', 'note']) {
      if (meta[k] !== undefined && meta[k] !== null) insMeta.run(k, String(meta[k]));
    }

    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* 回滚失败也要把原始错误抛出去 */ }
    throw new Error(`播种演示数据失败（已回滚）：${error.message}`);
  }
  return counts;
}

/** 库的演示档案是否已播种过。启动流程用它决定要不要 seedDemo。 */
export function hasDemoData(db) {
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM subjects').get().n > 0;
  } catch {
    return false;
  }
}
