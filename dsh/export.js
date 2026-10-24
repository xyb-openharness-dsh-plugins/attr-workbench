/* 门诊摘要导出。
 *
 * 契约（三条，写在构造里，不靠调用方自觉）：
 * 1. **复制出去的文字与你看到的一致**：文本与「病情汇总」页同源同序——同一份读模型、
 *    同一个 fmt。这里不新增第二份汇总逻辑，免得页面改了导出没改（或反过来）。
 * 2. **家系、看法与照护按构造排除**：本模块只 SELECT 白名单里的表
 *    （subjects / genotype_rows / phenotype_rows / stage_rows / metrics / metric_points /
 *    tolerance_rows）。`family_rows`、`viewpoints`、`caregiver_rows` 在代码里根本不出现——
 *    不是"读了再过滤"，是压根没读（H3 fail-closed：想泄漏都没有通道）。
 * 3. **只抄已入档记录，不做解读**：不产"是否恶化""是否达标"，数字是原值，
 *    单位是库里的单位；分期原样带"（均为医生给出）"字样。
 *
 * 空 ≠ 阴性：某段没数据就写"暂无记录"，不写"正常"。
 */

import { bootstrap } from './readmodels.js';
import { version, build } from '../lib/version.js';

const fmt = (v, dec) => {
  if (v === null || v === undefined || v === '') return '—';
  return dec === null || dec === undefined ? String(v) : Number(v).toFixed(dec);
};

/** 白名单表（导出允许读的）。加表 = 扩大导出面，必须同时改这里的注释与测试。 */
const ALLOWED_SOURCES = Object.freeze([
  'subjects（姓名/年龄）',
  'genotype_rows（型别）',
  'phenotype_rows（表型一行）',
  'stage_rows（医生分期）',
  'metrics + metric_points（最近一次指标）',
  'tolerance_rows（最近一次用药调整日期）',
]);

/** 确认导出面没被无意扩大：新表要进来先过这道名单。 */
export const EXPORT_ALLOWLIST = ALLOWED_SOURCES;

/** 病情汇总页的正文（无 HTML）。summary(profile) 返回的 text 就是页面上那段。 */
export function summaryText(profile) {
  const lines = [];

  /* 一句话现状 —— 与 viewRecords 的「病情汇总」页逐字一致 */
  const isVariant = profile.genotype.kind === 'variant';
  const phenotypeLine = (profile.phenotype[0] || [])[1] || '';
  lines.push(
    `${profile.name}，${profile.age} 岁，${isVariant ? '遗传型 ATTRv' : '野生型 ATTRwt'}，${phenotypeLine}。${profile.stage}。`
  );

  /* 最近一次记录 —— 指标取每个序列的最新点。
     注意：读模型的 points 按 ord 存（＝原型数组下标＝日期倒序），页面在 buildData 里
     统一按日期升序排过才取末点。导出必须做同一次排序，否则"复制出去的"是旧值
     （实测抓到：页面 980pg/mL，导出 1860pg/mL——末点取反了）。 */
  const byDate = (a, b) => String(a.d || '').localeCompare(String(b.d || ''));
  const latest = profile.metrics
    .map((m) => {
      const pts = [...m.points].sort(byDate);
      const last = pts.slice(-1)[0];
      if (!last) return null;
      return `${m.name} ${m.kind === 'numeric' ? fmt(last.v_num, m.dec) + m.unit : last.v_text}`;
    })
    .filter(Boolean)
    .join('；');
  lines.push(`最近一次记录：${latest || '暂无记录'}。`);
  const lastTol = profile.tolerance.slice(-1)[0] || [];
  lines.push(`最近一次用药调整：${lastTol[0] || '无记录'}。`);

  return lines.join('\n');
}

/**
 * 完整导出文本（给剪贴板/下载）：页头 + 摘要正文 + 固定免责段。
 * 免责段三句都不能少：不含家系、不含推断、数字未解读——用户复制出去的是
 * 一段完整材料，这三句是材料的一部分，不是界面装饰。
 */
export function exportSummaryText(db, profileKey) {
  const payload = bootstrap(db, { version, build });
  const profile = payload.profiles[profileKey];
  if (!profile) throw new Error(`档案不存在：${profileKey}`);
  const isVariant = profile.genotype.kind === 'variant';
  const head = [
    `小甲宝 · 门诊摘要（只含已入档记录）`,
    `档案：${profile.name}（${profile.age} 岁）· ${isVariant ? '遗传型 ATTRv' : '野生型 ATTRwt'}`,
    ``,
  ];
  const foot = [
    ``,
    `—`,
    `本摘要不含私密家系信息、不含医生未确认的推断；数字均为已入档记录的原值，未经解读。`,
    `是否调整治疗由医生决定。生成于 ${new Date().toISOString().slice(0, 10)} · 小甲宝 ATTR-Pal v${version}`,
  ];
  return {
    profileKey,
    text: [...head, summaryText(profile), ...foot].join('\n'),
    excluded: ['family_rows', 'viewpoints', 'caregiver_rows'],
  };
}
