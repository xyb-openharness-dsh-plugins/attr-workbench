#!/usr/bin/env node
/* ATTR 工作台 · 演示数据生成器（唯一数据源）
 *
 * 只做两件事：
 *   1. 写 demo/demo-data.sqlite（按 schema/0001_initial.sql 全部迁移建表后插入）
 *   2. 写 prototypes/v0.2/demo-data.js（window.DEMO_DATA = {...}）
 * 被 import 时只导出 buildDemoProfiles() 纯数据，**不碰磁盘**（dsh/demo.js 阶段 2 会复用它）。
 *
 * 口径（与 docs/SCHEMA.md §6 一致，改口径两边同步）：
 *   - 化验/体征每 2–4 周一点，延续到 2026-10-21；影像/心超按真实频率，不加密。
 *   - 2 套档案 × 6 个月；换档案后默认指标与初始同构：两条数值线 + 一条分类序列。
 *   - demo 时间窗固定，不随运行日期漂移（否则 parity 与截图会每天变）。
 *
 * 用法：node demo/build-demo-data.mjs [--check]
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TODAY = '2026-10-21'
const BUILD = TODAY

/* ---------------- 工具 ---------------- */

const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => iso(new Date(Date.parse(TODAY + 'T00:00:00Z') - n * 86400000))

/** 从起点按步长生成日期（步长列表循环），最后补一个到 TODAY 附近 */
function series(startDaysAgo, steps, extraTail = 0) {
  const out = []
  let d = startDaysAgo
  let i = 0
  while (d > extraTail) {
    out.push(daysAgo(d))
    d -= steps[i % steps.length]
    i++
  }
  return out.reverse()
}

/* ---------------- 档案 A：ATTRv（A97S），神经为主 + 轻度心脏 ---------------- */

function profileA() {
  const p = {
    name: '陈志远',
    sex: '男',
    age: 61,
    meta: '61 岁 · 遗传型 ATTRv（A97S）· 神经为主',
    headline: '脚麻从 2022 年开始，2024 年底才拿到名字。',
    stage: 'NYHA Ⅱ · FAP Ⅰ · Gillmore Ⅱ（均为医生给出，2026-08-14）',
    mindset: '想知道这病会不会传给孩子，也想知道脚麻还能不能慢一点。',
    path: ['遗传型 ATTRv', 'TTR c.349G>T (p.Ala117Ser) 杂合', '神经为主 · 轻度心肌受累', '氯苯唑酸 61 mg 每日一次'],
    activity: '每天慢走 20 分钟；上下楼扶扶手；晚上把脚垫高。',
    familyTalk: '已跟姐姐说过一次，还没跟儿子开口——他今年刚结婚。',
    genotype: {
      kind: 'variant',
      variant: 'TTR c.349G>T (p.Ala117Ser)',
      zygosity: '杂合',
      method: 'Sanger 测序（报告原文）',
      lab: '某三甲医院分子诊断中心',
      reportDate: '2024-11-28',
      doctorText: '医生原话：「这个位点在国内遗传型里不算少见，家里直系亲属可以来查。」',
      state: 'done'
    },
    phenotype: [
      ['表型', '神经为主（多发性神经病），合并轻度心肌受累', '2026-08-14 门诊记录'],
      ['起病年龄', '57 岁（2022 年先出现足趾麻木）', '患者自述'],
      ['首发症状', '双足趾麻木、夜间烧灼感', '患者自述'],
      ['目前主要负担', '走路不稳、腹泻便秘交替、站起来头晕', '患者自述']
    ],
    stages: [
      ['NYHA', 'Ⅱ', '2026-08-14', 'doctor', '「活动轻度受限，平地走两个路口要停一下。」'],
      ['FAP', 'Ⅰ', '2026-05-20', 'doctor', '「还能独立行走，不需要辅具。」'],
      ['Gillmore/NAC', 'Ⅱ', '2026-08-14', 'doctor', '「NT-proBNP 和 eGFR 一项达标。」']
    ],
    diagnosis: [
      ['warning', 'done', '心超室壁厚 14 mm、心电图肢体导联低电压、双侧腕管松解史', '2024-10-18', '某三甲医院心内科', '「先按心肌病查，注意淀粉样变。」'],
      ['pyp', 'done', '99mTc-PYP 心肌摄取 Perugini 3 级（高于肋骨摄取）', '2024-11-05', '某三甲医院核医学科', '「3 级，结合轻链阴性基本可以定。」'],
      ['flc', 'done', '血清游离轻链 κ/λ 比值 1.12；血/尿免疫固定电泳未见单克隆条带', '2024-11-06', '某三甲医院检验科', '「AL 先排掉了。」'],
      ['gene', 'done', 'TTR c.349G>T (p.Ala117Ser)，杂合', '2024-11-28', '某三甲医院分子诊断中心', '「遗传型，家里人可以查。」']
    ],
    cardiac: [
      ['2026-05-12', '活动后气短', '上两层楼要停一次', '与三个月前差不多'],
      ['2026-07-08', '踝部水肿', '傍晚明显，晨起消退', '已告知门诊医生'],
      ['2026-09-16', '起床时眼前发黑', '持续十几秒', '当时血压 96/60（站立）'],
      ['2026-10-15', '活动后气短', '平地走两个路口要停', '比 5 月略重']
    ],
    echo: [
      ['2026-04-22', '心超', 14.2, 13.8, 58, -14.2, '心内膜下弥漫延迟强化', '双房增大，心肌颗粒样回声', '某三甲医院超声科'],
      ['2026-10-15', '心超', 14.6, 14.0, 55, -12.8, '同前，范围略扩大', '室壁较 4 月略厚，舒张功能减低', '某三甲医院超声科']
    ],
    rhythmEvents: [
      ['2026-06-02', '房颤', '阵发性，持续约 6 小时后自行转复', '医生加做动态心电图，未改抗凝方案'],
      ['2026-09-16', '晕厥前兆', '起床后眼前发黑，未跌倒', '门诊测立位血压偏低，嘱缓慢起身']
    ],
    bp: [
      ['2026-07-08', '卧', 118, 72, 68, '无', '托拉塞米 10 mg'],
      ['2026-07-08', '立', 102, 64, 76, '轻微头晕', '托拉塞米 10 mg'],
      ['2026-09-16', '卧', 116, 70, 66, '无', '托拉塞米 10 mg'],
      ['2026-09-16', '立', 96, 60, 82, '眼前发黑', '托拉塞米 10 mg'],
      ['2026-10-15', '坐', 112, 68, 70, '无', '托拉塞米 10 mg']
    ],
    neuro: [
      ['2026-05-12', '感觉', '双足趾麻木', '只在夜里明显', ''],
      ['2026-07-08', '感觉', '袜套样麻木到踝部', '白天也有', ''],
      ['2026-08-20', '疼痛', '夜间足部烧灼感', '影响入睡', ''],
      ['2026-09-16', '运动', '上楼时腿发软', '需要扶扶手', ''],
      ['2026-10-15', '感觉', '手指尖端麻木', '扣扣子变慢', '']
    ],
    autonomic: [
      ['2026-06-02', '胃肠', '腹泻与便秘交替', '一周内两次腹泻，三天未排便'],
      ['2026-07-08', '泌尿', '夜尿增多', '每晚 2–3 次'],
      ['2026-08-20', '出汗', '下半身出汗减少', '天热时也不怎么出汗'],
      ['2026-09-16', '体位', '站起时头晕', '与血压记录同日']
    ],
    redflags: [
      ['before', '双侧腕管松解术', '2018', '双侧', '先在骨科做的手术，当时没人提淀粉样变'],
      ['before', '腰椎管狭窄', '2021', '—', '影像报告写"黄韧带增厚"'],
      ['after', '反复白内障', '2025', '右眼', '眼科门诊记录']
    ],
    drugs: [
      ['氯苯唑酸（tafamidis）', '稳定剂', '61 mg', '每日一次，随餐', '2025-03-12', null, 'active', '', '「先吃着，三个月复查一次。」'],
      ['托拉塞米', '支持治疗（利尿）', '10 mg', '每日一次', '2025-06-02', null, 'active', '', '「水肿明显时按医生说的用。」'],
      ['普瑞巴林', '支持治疗（神经痛）', '75 mg', '每日两次', '2024-12-10', '2025-09-02', 'stopped', '服药后头晕、白天嗜睡，医生嘱停用', '「先停掉，看头晕是不是它引起的。」']
    ],
    tolerance: [
      ['2025-09-02', '普瑞巴林', '头晕、嗜睡', '白天需要躺下', '医生嘱停用，停药后头晕减轻'],
      ['2026-06-02', '氯苯唑酸（tafamidis）', '腹泻', '一周两次，与既往交替性腹泻难区分', '门诊记录，未停药'],
      ['2026-07-08', '托拉塞米', '站立时头晕', '与立位血压偏低同日', '医生嘱缓慢起身，未改剂量']
    ],
    family: [
      ['母亲', '母亲', '未检测', '未告知', '已故，生前有"心脏肥大"记录', 1],
      ['姐姐', '大姐', '未检测', '未告知', '已当面说过一次，她说要想想', 1],
      ['儿子', '儿子', '已检测', '阴性', '2025-03 在遗传门诊抽血', 1]
    ],
    counsel: [
      ['2025-01-08', '某三甲医院遗传门诊', '遗传咨询师', '家系级联筛查怎么做、谁先查', '「先查一级亲属，查之前先讲清楚查出来意味着什么。」']
    ],
    daily: [
      ['2026-07-08', '饮食', '按医生说的少放盐', '每天食盐约 4 g（自估）', '踝部水肿'],
      ['2026-08-20', '体重', '晨起空腹', '68.4 kg', ''],
      ['2026-09-16', '活动', '平地慢走', '20 分钟', '走完小腿发沉'],
      ['2026-10-15', '出行', '坐高铁回老家', '3 小时', '中途起身两次，怕久坐腿肿']
    ],
    viewpoints: [
      ['2026-06-02', '累', '最怕的不是脚麻，是不知道十年后还能不能自己走路。'],
      ['2026-09-16', '担心', '儿子刚结婚，我不知道该不该现在跟他说这个病。']
    ],
    rhythmRows: [
      ['心超', '每 6 个月', '医生安排', '2026-04-22', '2026-10-15'],
      ['NT-proBNP + 肾功能', '每 3 个月', '医生安排', '2026-07-08', '2026-10-15'],
      ['神经科门诊', '每 6 个月', '医生安排', '2026-05-20', '2026-11-20'],
      ['遗传门诊', '按需', '医生安排', '2025-01-08', '未约']
    ],
    monitor: [
      ['心超', '每 6 个月', '2026-10-15', '2027-04'],
      ['NT-proBNP / eGFR', '每 3 个月', '2026-10-15', '2027-01'],
      ['家系成员检测跟进', '按需', '2025-03', '未约']
    ],
    docs: [
      ['DOC-A-1', '2026-10-15 化验单（NT-proBNP / 肌酐 / 电解质）', '2026-10-15', '化验', '已核对'],
      ['DOC-A-2', '2026-10-15 心超报告', '2026-10-15', '心超', '已核对'],
      ['DOC-A-3', '2024-11-05 99mTc-PYP 显像报告', '2024-11-05', '核素', '已核对'],
      ['DOC-A-4', '2024-11-28 TTR 基因检测报告', '2024-11-28', '基因', '已核对'],
      ['DOC-A-5', '2026-06-02 出院小结', '2026-06-02', '出院小结', '待解析']
    ],
    candidates: [
      ['CAND-A-1', 'NT-proBNP', '1,860 pg/mL', '2026-10-15 化验单', 'accepted'],
      ['CAND-A-2', 'eGFR', '52 mL/min/1.73m²', '2026-10-15 化验单', 'accepted'],
      ['CAND-A-3', '体重', '68.4 kg', '2026-08-20 自测', 'accepted'],
      ['CAND-A-4', '心电图结论', '肢体导联低电压', '2026-06-02 出院小结', 'candidate']
    ]
  }

  p.metrics = [
    {
      key: 'ntprobnp', name: 'NT-proBNP', unit: 'pg/mL', cat: 'heart', color: '#2E6E7E', dec: 0, kind: 'numeric',
      band_low: null, band_high: null, note: '心衰与分期相关指标，只记录报告值',
      points: series(180, [21, 28, 14], 0).map((d, i) => ({
        d, v_num: [980, 1040, 1120, 1260, 1310, 1450, 1520, 1680, 1860][i] ?? 1860, v_text: null, src: i % 2 ? '门诊化验' : '住院化验'
      }))
    },
    {
      key: 'egfr', name: 'eGFR', unit: 'mL/min/1.73m²', cat: 'kidney', color: '#9A6410', dec: 0, kind: 'numeric',
      band_low: 60, band_high: 120, note: '按报告抄，不自行换算',
      points: series(180, [28, 21, 14], 0).map((d, i) => ({
        d, v_num: [64, 62, 60, 58, 57, 55, 54, 52][i] ?? 52, v_text: null, src: '门诊化验'
      }))
    },
    {
      key: 'nyha', name: 'NYHA 心功能', unit: '', cat: 'heart', color: '#3A6B7E', dec: null, kind: 'grade',
      band_low: null, band_high: null, note: '医生给出，患者不自评',
      points: [
        { d: '2026-05-20', v_num: null, v_text: 'Ⅱ', src: '神经科门诊' },
        { d: '2026-08-14', v_num: null, v_text: 'Ⅱ', src: '心内科门诊' },
        { d: '2026-10-15', v_num: null, v_text: 'Ⅱ', src: '心内科门诊' }
      ]
    },
    {
      key: 'weight', name: '体重', unit: 'kg', cat: 'blood', color: '#6B7C8E', dec: 1, kind: 'numeric',
      band_low: null, band_high: null, note: '晨起空腹自测',
      points: [
        { d: '2026-05-12', v_num: 70.2, v_text: null, src: '自测' },
        { d: '2026-06-16', v_num: 69.6, v_text: null, src: '自测' },
        { d: '2026-07-22', v_num: 69.0, v_text: null, src: '自测' },
        { d: '2026-08-20', v_num: 68.4, v_text: null, src: '自测' },
        { d: '2026-09-24', v_num: 68.1, v_text: null, src: '自测' },
        { d: '2026-10-15', v_num: 67.8, v_text: null, src: '门诊称重' }
      ]
    }
  ]
  p.events = [
    ['2018-06-11', '双侧腕管松解术'],
    ['2022-03-08', '足趾麻木起病'],
    ['2024-11-05', 'PYP 3 级'],
    ['2024-11-28', '基因：A97S 杂合'],
    ['2025-03-12', '起始氯苯唑酸'],
    ['2026-06-02', '阵发房颤'],
    ['2026-09-16', '立位低血压']
  ]
  p.dash_keys = ['ntprobnp', 'egfr', 'nyha', 'weight']
  return p
}

/* ---------------- 档案 B：ATTRwt，心脏为主 ---------------- */

function profileB() {
  const p = {
    name: '周德昌',
    sex: '男',
    age: 77,
    meta: '77 岁 · 野生型 ATTRwt · 心脏为主',
    headline: '做了两次腕管手术，八年后才知道是同一个病。',
    stage: 'NYHA Ⅲ · Gillmore Ⅲ（医生给出，2026-09-05）',
    mindset: '不想再折腾检查，只想知道现在这个状态还能稳住多久。',
    path: ['野生型 ATTRwt', '未做基因检测（医生认为不必）', '心脏为主 · 轻度周围神经症状', '氯苯唑酸 61 mg 每日一次'],
    activity: '只在小区里走十分钟；出门要人陪。',
    familyTalk: '孩子们都知道了，医生说这个不传，我也就放心了。',
    genotype: {
      kind: 'wildtype',
      variant: null,
      zygosity: null,
      method: null,
      lab: null,
      reportDate: null,
      doctorText: '「野生型，不用查基因，孩子们也不用因为你这个去查。」',
      state: 'done'
    },
    phenotype: [
      ['表型', '心脏为主（HFpEF），合并轻度周围神经症状', '2026-09-05 门诊记录'],
      ['起病年龄', '约 70 岁（先出现活动后气短）', '患者自述'],
      ['首发症状', '活动后气短、下肢水肿', '患者自述'],
      ['目前主要负担', '走十分钟就喘、夜里要垫高枕头', '患者自述']
    ],
    stages: [
      ['NYHA', 'Ⅲ', '2026-09-05', 'doctor', '「平地走十分钟就要停。」'],
      ['Gillmore/NAC', 'Ⅲ', '2026-09-05', 'doctor', '「NT-proBNP 和 eGFR 两项都达标。」']
    ],
    diagnosis: [
      ['warning', 'done', '心超室壁厚 16 mm、心电图低电压、双侧腕管松解史（2014/2016）', '2024-03-12', '某三甲医院心内科', '「老年男性 HFpEF + 室壁厚，要想到淀粉样变。」'],
      ['pyp', 'done', '99mTc-PYP 心肌摄取 Perugini 3 级', '2024-04-18', '某三甲医院核医学科', '「3 级。」'],
      ['flc', 'done', '血清游离轻链 κ/λ 比值 0.94；免疫固定电泳未见单克隆条带', '2024-04-19', '某三甲医院检验科', '「不是 AL。」'],
      ['gene', 'not_done', null, '2024-05-10', '某三甲医院心内科', '「野生型不需要做基因，家里也不用查。」']
    ],
    cardiac: [
      ['2026-05-08', '活动后气短', '走十分钟', '夜间需垫高枕头'],
      ['2026-07-14', '下肢水肿', '到小腿中段', '利尿剂加量后减轻'],
      ['2026-09-05', '活动后气短', '走五分钟', '比 5 月明显'],
      ['2026-10-10', '夜间憋醒', '一次', '坐起来十分钟缓解']
    ],
    echo: [
      ['2026-03-14', '心超', 16.1, 15.4, 52, -11.4, '弥漫心内膜下延迟强化', '双房增大，肺动脉收缩压 42 mmHg', '某三甲医院超声科'],
      ['2026-09-05', '心超', 16.4, 15.8, 48, -10.2, '范围较前扩大', '肺动脉收缩压 46 mmHg，少量心包积液', '某三甲医院超声科']
    ],
    rhythmEvents: [
      ['2022-03-20', '起搏器植入', '病态窦房结综合征，双腔起搏器', '术后规律随访'],
      ['2023-05-11', '房颤', '持续性', '医生启动抗凝，未复律'],
      ['2026-10-10', '夜间憋醒', '一次', '门诊调整利尿剂']
    ],
    bp: [
      ['2026-07-14', '卧', 108, 66, 72, '无', '托拉塞米 20 mg + 利伐沙班'],
      ['2026-07-14', '立', 94, 58, 80, '起身时头晕', '托拉塞米 20 mg + 利伐沙班'],
      ['2026-10-10', '坐', 104, 62, 74, '无', '托拉塞米 20 mg + 利伐沙班']
    ],
    neuro: [
      ['2026-05-08', '感觉', '双足轻度麻木', '不影响走路', ''],
      ['2026-09-05', '感觉', '袜套样麻木到踝部', '夜间偶有烧灼感', '']
    ],
    autonomic: [
      ['2026-07-14', '胃肠', '便秘', '三四天一次', ''],
      ['2026-09-05', '体位', '起身头晕', '与立位血压同日']
    ],
    redflags: [
      ['before', '双侧腕管松解术', '2014', '右侧', '当时诊断为"特发性"'],
      ['before', '双侧腕管松解术', '2016', '左侧', '术后症状缓解'],
      ['before', '腰椎管狭窄', '2019', '—', '保守治疗，未手术']
    ],
    drugs: [
      ['氯苯唑酸（tafamidis）', '稳定剂', '61 mg', '每日一次，随餐', '2024-06-03', null, 'active', '', '「按说明书吃，三个月复查。」'],
      ['托拉塞米', '支持治疗（利尿）', '20 mg', '每日一次', '2024-06-03', null, 'active', '', '「体重涨两斤就加半片。」'],
      ['利伐沙班', '支持治疗（抗凝）', '15 mg', '每日一次', '2023-05-11', null, 'active', '', '「房颤，按医生说的抗凝。」']
    ],
    tolerance: [
      ['2026-07-14', '托拉塞米', '起身头晕', '立位 94/58', '医生嘱减量观察，未停'],
      ['2026-10-10', '氯苯唑酸（tafamidis）', '腹泻', '两天一次，轻', '门诊记录，继续服用']
    ],
    family: [
      ['儿子', '大儿子', '未检测', '未告知', '医生说不遗传，未安排检测', 1],
      ['女儿', '小女儿', '未检测', '未告知', '同上', 1]
    ],
    counsel: [],
    daily: [
      ['2026-07-14', '饮食', '少盐，汤不喝', '自估每天 3 g', '水肿'],
      ['2026-09-05', '体重', '晨起', '71.0 kg', ''],
      ['2026-10-10', '活动', '小区慢走', '10 分钟', '走完喘']
    ],
    viewpoints: [
      ['2026-09-05', '平静', '不指望好起来，只希望别一下子垮下去。']
    ],
    rhythmRows: [
      ['心超', '每 3–6 个月', '医生安排', '2026-03-14', '2026-09-05'],
      ['NT-proBNP + 肾功能', '每 3 个月', '医生安排', '2026-07-14', '2026-10-10'],
      ['起搏器程控', '每 6–12 个月', '医生安排', '2026-02', '2026-11'],
      ['心内科门诊', '每 3 个月', '医生安排', '2026-09-05', '2026-12']
    ],
    monitor: [
      ['心超', '每 3–6 个月', '2026-09-05', '2026-12'],
      ['NT-proBNP / eGFR', '每 3 个月', '2026-10-10', '2027-01'],
      ['起搏器程控', '每 6–12 个月', '2026-02', '2026-11']
    ],
    docs: [
      ['DOC-B-1', '2026-10-10 化验单（NT-proBNP / 肌酐）', '2026-10-10', '化验', '已核对'],
      ['DOC-B-2', '2026-09-05 心超报告', '2026-09-05', '心超', '已核对'],
      ['DOC-B-3', '2024-04-18 99mTc-PYP 报告', '2024-04-18', '核素', '已核对'],
      ['DOC-B-4', '2023-05-11 出院小结（房颤）', '2023-05-11', '出院小结', '已核对']
    ],
    candidates: [
      ['CAND-B-1', 'NT-proBNP', '3,120 pg/mL', '2026-10-10 化验单', 'accepted'],
      ['CAND-B-2', 'eGFR', '41 mL/min/1.73m²', '2026-10-10 化验单', 'accepted'],
      ['CAND-B-3', '体重', '71.0 kg', '2026-09-05 门诊称重', 'accepted']
    ]
  }

  p.metrics = [
    {
      key: 'ntprobnp', name: 'NT-proBNP', unit: 'pg/mL', cat: 'heart', color: '#2E6E7E', dec: 0, kind: 'numeric',
      band_low: null, band_high: null, note: '心衰与分期相关指标，只记录报告值',
      points: series(180, [21, 28, 14], 0).map((d, i) => ({
        d, v_num: [2180, 2320, 2410, 2560, 2740, 2890, 2980, 3120][i] ?? 3120, v_text: null, src: i % 2 ? '门诊化验' : '住院化验'
      }))
    },
    {
      key: 'egfr', name: 'eGFR', unit: 'mL/min/1.73m²', cat: 'kidney', color: '#9A6410', dec: 0, kind: 'numeric',
      band_low: 60, band_high: 120, note: '按报告抄，不自行换算',
      points: series(180, [28, 21, 14], 0).map((d, i) => ({
        d, v_num: [52, 50, 49, 47, 46, 44, 43, 41][i] ?? 41, v_text: null, src: '门诊化验'
      }))
    },
    {
      key: 'nyha', name: 'NYHA 心功能', unit: '', cat: 'heart', color: '#3A6B7E', dec: null, kind: 'grade',
      band_low: null, band_high: null, note: '医生给出，患者不自评',
      points: [
        { d: '2026-03-14', v_num: null, v_text: 'Ⅱ', src: '心内科门诊' },
        { d: '2026-09-05', v_num: null, v_text: 'Ⅲ', src: '心内科门诊' }
      ]
    },
    {
      key: 'weight', name: '体重', unit: 'kg', cat: 'blood', color: '#6B7C8E', dec: 1, kind: 'numeric',
      band_low: null, band_high: null, note: '晨起空腹自测',
      points: [
        { d: '2026-05-08', v_num: 73.8, v_text: null, src: '自测' },
        { d: '2026-06-12', v_num: 73.2, v_text: null, src: '自测' },
        { d: '2026-07-14', v_num: 72.6, v_text: null, src: '门诊称重' },
        { d: '2026-09-05', v_num: 71.0, v_text: null, src: '门诊称重' },
        { d: '2026-10-10', v_num: 70.4, v_text: null, src: '门诊称重' }
      ]
    }
  ]
  p.events = [
    ['2014-05-20', '右侧腕管松解'],
    ['2016-09-12', '左侧腕管松解'],
    ['2022-03-20', '起搏器植入'],
    ['2023-05-11', '持续房颤'],
    ['2024-04-18', 'PYP 3 级'],
    ['2024-05-20', '确诊 ATTRwt'],
    ['2024-06-03', '起始氯苯唑酸'],
    ['2026-09-05', 'NYHA Ⅲ']
  ]
  p.dash_keys = ['ntprobnp', 'egfr', 'nyha', 'weight']
  return p
}

/* ---------------- 试验收藏（真实登记摘录，状态未核实） ---------------- */

const TRIALS = [
  {
    record_id: 'chinadrugtrials:CTR20233114',
    source: 'chinadrugtrials',
    title: '一项 eplontersen 在中国转甲状腺素蛋白淀粉样变性心肌病受试者中的 III 期研究',
    status: '进行中 招募完成',
    note: '',
    saved: 1
  },
  {
    record_id: 'chinadrugtrials:CTR20260982',
    source: 'chinadrugtrials',
    title: 'TRITON-CM：评估 Nucresiran 治疗转甲状腺素蛋白淀粉样变性心肌病患者的研究',
    status: '进行中 招募中',
    note: '',
    saved: 1
  },
  {
    record_id: 'chinadrugtrials:CTR20241546',
    source: 'chinadrugtrials',
    title: '在 ATTR-CM 成人受试者中比较 ALXN2220 与安慰剂的研究',
    status: '进行中 招募完成',
    note: '',
    saved: 0
  },
  {
    record_id: 'chinadrugtrials:CTR20260419',
    source: 'chinadrugtrials',
    title: 'CLEOPATTRA：在因 ATTR 淀粉样变性导致心力衰竭的人群中评估 coramitug',
    status: '进行中 招募中',
    note: '',
    saved: 0
  }
]

/* ---------------- 纯数据出口（被 import 时不碰磁盘） ---------------- */

export function buildDemoProfiles() {
  return {
    meta: {
      version: '0.1.0',
      build: BUILD,
      windowStart: daysAgo(180),
      windowEnd: TODAY,
      note: '全部为模拟档案；临床试验条目为真实登记摘录，状态未核实。'
    },
    profiles: { A: profileA(), B: profileB() },
    trials: TRIALS
  }
}

/* ---------------- 写盘 ---------------- */

async function writeJs(data) {
  const dir = join(ROOT, 'prototypes', 'v0.2')
  await mkdir(dir, { recursive: true })
  const body = '/* 由 demo/build-demo-data.mjs 生成，勿手改。 */\nwindow.DEMO_DATA = ' + JSON.stringify(data, null, 1) + ';\n'
  await writeFile(join(dir, 'demo-data.js'), body)
  return body.length
}

async function applyMigrations(db) {
  const dir = join(ROOT, 'schema')
  const files = (await import('node:fs/promises')).readdir ? await (await import('node:fs/promises')).readdir(dir) : []
  const sqls = files.filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()
  for (const f of sqls) db.exec(await readFile(join(dir, f), 'utf8'))
  return sqls
}

async function writeSqlite(data) {
  const { DatabaseSync } = await import('node:sqlite')
  const file = join(ROOT, 'demo', 'demo-data.sqlite')
  await mkdir(dirname(file), { recursive: true })
  if (existsSync(file)) await rm(file)
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  const sqls = await applyMigrations(db)

  const insSubject = db.prepare(`INSERT INTO subjects (profile_key,name,sex,age,meta,headline,stage,mindset,dash_keys,path,activity,family_talk,
    genotype_title,phenotype_title,stage_title,diagnosis_title,cardiac_title,echo_title,bp_title,neuro_title,autonomic_title,redflag_title,
    drug_title,tolerance_title,family_title,counsel_title,daily_title) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

  db.exec('BEGIN')
  for (const [k, p] of Object.entries(data.profiles)) {
    const isVariant = p.genotype.kind === 'variant'
    insSubject.run(k, p.name, p.sex, p.age, p.meta, p.headline, p.stage, p.mindset,
      JSON.stringify(p.dash_keys), JSON.stringify(p.path), p.activity, p.familyTalk,
      isVariant ? '型别与基因' : null, '表型与分期', '分期记录', '确诊路径', '心衰症状与体征', '心超与影像', '血压与用药耐受',
      '感觉与运动', '自主神经', '腕管与脊柱', '当前方案', '用药与耐受', '家系图', '遗传咨询记录', '饮食与体重')

    const insMetric = db.prepare(`INSERT INTO metrics (profile_key,key,name,unit,cat,color,dec,kind,band_low,band_high,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    const insPoint = db.prepare(`INSERT INTO metric_points (profile_key,metric_key,d,v_num,v_text,src,ord)
      VALUES (?,?,?,?,?,?,?)`)
    p.metrics.forEach((m, mi) => {
      insMetric.run(k, m.key, m.name, m.unit, m.cat, m.color, m.dec, m.kind, m.band_low, m.band_high, m.note)
      m.points.forEach((pt, pi) => insPoint.run(k, m.key, pt.d, pt.v_num, pt.v_text, pt.src, pi))
    })
    db.prepare('INSERT INTO metric_groups (profile_key,grp,label,ord) VALUES (?,?,?,?)').run(k, 'heart', '心脏', 1)
    db.prepare('INSERT INTO metric_groups (profile_key,grp,label,ord) VALUES (?,?,?,?)').run(k, 'kidney', '肾脏', 2)
    db.prepare('INSERT INTO metric_groups (profile_key,grp,label,ord) VALUES (?,?,?,?)').run(k, 'blood', '体重与血液', 3)
    db.prepare('INSERT INTO metric_groups (profile_key,grp,label,ord) VALUES (?,?,?,?)').run(k, 'neuro', '神经', 4)

    const insEvent = db.prepare('INSERT INTO events (profile_key,d,label,kind) VALUES (?,?,?,?)')
    p.events.forEach(([d, label]) => insEvent.run(k, d, label, /起病|确诊|级|基因/.test(label) ? 'diagnosis' : 'event'))

    const insRhythm = db.prepare('INSERT INTO rhythm (profile_key,item,freq,guideline,next,ord) VALUES (?,?,?,?,?,?)')
    p.rhythmRows.forEach((r, i) => insRhythm.run(k, r[0], r[1], r[2], r[4] ?? r[3], i))

    const insMonitor = db.prepare('INSERT INTO monitor_rows (profile_key,item,freq,last,next,note,ord) VALUES (?,?,?,?,?,?,?)')
    p.monitor.forEach((r, i) => insMonitor.run(k, r[0], r[1], r[2], r[3], null, i))

    const insVP = db.prepare('INSERT INTO viewpoints (profile_key,d,mood,text,private,ord) VALUES (?,?,?,?,?,?)')
    p.viewpoints.forEach((v, i) => insVP.run(k, v[0], v[1], v[2], 0, i))

    const insDoc = db.prepare('INSERT INTO documents (profile_key,id,name,date,type,status,ord) VALUES (?,?,?,?,?,?,?)')
    p.docs.forEach((d, i) => insDoc.run(k, d[0], d[1], d[2], d[3], d[4], i))
    const insCand = db.prepare('INSERT INTO candidate_fields (profile_key,id,name,value,source,status,ord) VALUES (?,?,?,?,?,?,?)')
    p.candidates.forEach((c, i) => insCand.run(k, c[0], c[1], c[2], c[3], c[4], i))

    db.prepare(`INSERT INTO genotype_rows (profile_key,kind,variant,zygosity,method,lab,report_date,doctor_text,state,revision_of,superseded,ord)
      VALUES (?,?,?,?,?,?,?,?,?,NULL,0,0)`).run(k, p.genotype.kind, p.genotype.variant, p.genotype.zygosity,
      p.genotype.method, p.genotype.lab, p.genotype.reportDate, p.genotype.doctorText, p.genotype.state)

    const insPheno = db.prepare('INSERT INTO phenotype_rows (profile_key,item,value,note,ord) VALUES (?,?,?,?,?)')
    p.phenotype.forEach((r, i) => insPheno.run(k, r[0], r[1], r[2], i))

    const insStage = db.prepare('INSERT INTO stage_rows (profile_key,scheme,value,d,by_who,doctor_text,ord) VALUES (?,?,?,?,?,?,?)')
    p.stages.forEach((r, i) => insStage.run(k, r[0], r[1], r[2], r[3], r[4], i))

    const insDiag = db.prepare('INSERT INTO diagnosis_rows (profile_key,step,state,finding,d,institution,doctor_text,ord) VALUES (?,?,?,?,?,?,?,?)')
    p.diagnosis.forEach((r, i) => insDiag.run(k, r[0], r[1], r[2], r[3], r[4], r[5], i))

    const insCardiac = db.prepare('INSERT INTO cardiac_rows (profile_key,d,symptom,severity,note,self,ord) VALUES (?,?,?,?,?,1,?)')
    p.cardiac.forEach((r, i) => insCardiac.run(k, r[0], r[1], r[2], r[3], i))

    const insEcho = db.prepare(`INSERT INTO echo_rows (profile_key,d,kind,ivsd,lvpwd,lvef,gls,lge,finding,institution,ord)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    p.echo.forEach((r, i) => insEcho.run(k, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], i))

    const insRhythmEvent = db.prepare('INSERT INTO rhythm_events (profile_key,d,kind,detail,action,ord) VALUES (?,?,?,?,?,?)')
    p.rhythmEvents.forEach((r, i) => insRhythmEvent.run(k, r[0], r[1], r[2], r[3], i))

    const insBp = db.prepare('INSERT INTO bp_rows (profile_key,d,position,sys,dia,pulse,symptom,drug_note,ord) VALUES (?,?,?,?,?,?,?,?,?)')
    p.bp.forEach((r, i) => insBp.run(k, r[0], r[1], r[2], r[3], r[4], r[5], r[6], i))

    const insNeuro = db.prepare('INSERT INTO neuro_rows (profile_key,d,domain,symptom,severity,note,self,ord) VALUES (?,?,?,?,?,?,1,?)')
    p.neuro.forEach((r, i) => insNeuro.run(k, r[0], r[1], r[2], r[3], r[4], i))

    const insAuto = db.prepare('INSERT INTO autonomic_rows (profile_key,d,domain,symptom,detail,self,ord) VALUES (?,?,?,?,?,1,?)')
    p.autonomic.forEach((r, i) => insAuto.run(k, r[0], r[1], r[2], r[3], i))

    const insFlag = db.prepare('INSERT INTO redflag_rows (profile_key,phase,item,year,side,note,ord) VALUES (?,?,?,?,?,?,?)')
    p.redflags.forEach((r, i) => insFlag.run(k, r[0], r[1], r[2], r[3], r[4], i))

    const insDrug = db.prepare(`INSERT INTO drug_rows (profile_key,name,mechanism,dose,schedule,start,end,status,reason,doctor_text,ord)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    p.drugs.forEach((r, i) => insDrug.run(k, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], i))

    const insTol = db.prepare('INSERT INTO tolerance_rows (profile_key,d,drug,kind,detail,action,ord) VALUES (?,?,?,?,?,?,?)')
    p.tolerance.forEach((r, i) => insTol.run(k, r[0], r[1], r[2], r[3], r[4], i))

    const insFam = db.prepare('INSERT INTO family_rows (profile_key,rel,label,tested,result,note,private,ord) VALUES (?,?,?,?,?,?,?,?)')
    p.family.forEach((r, i) => insFam.run(k, r[0], r[1], r[2], r[3], r[4], r[5], i))

    const insCounsel = db.prepare('INSERT INTO counsel_rows (profile_key,d,institution,who,topic,doctor_text,ord) VALUES (?,?,?,?,?,?,?)')
    p.counsel.forEach((r, i) => insCounsel.run(k, r[0], r[1], r[2], r[3], r[4], i))

    const insDaily = db.prepare('INSERT INTO daily_rows (profile_key,d,kind,detail,amount,symptom,note,ord) VALUES (?,?,?,?,?,?,?,?)')
    p.daily.forEach((r, i) => insDaily.run(k, r[0], r[1], r[2], r[3], r[4], r[5] ?? null, i))
  }

  const insTrial = db.prepare('INSERT INTO trials (record_id,source,title,status,note,saved,ord) VALUES (?,?,?,?,?,?,?)')
  data.trials.forEach((t, i) => insTrial.run(t.record_id, t.source, t.title, t.status, t.note, t.saved, i))

  db.prepare('INSERT INTO demo_meta (k,v) VALUES (?,?)').run('version', data.meta.version)
  db.prepare('INSERT INTO demo_meta (k,v) VALUES (?,?)').run('build', data.meta.build)
  db.prepare('INSERT INTO demo_meta (k,v) VALUES (?,?)').run('window', `${data.meta.windowStart}..${data.meta.windowEnd}`)
  db.exec('COMMIT')
  const tables = db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n
  db.close()
  return { file, migrations: sqls, tables }
}

async function main() {
  const data = buildDemoProfiles()
  const jsLen = await writeJs(data)
  const info = await writeSqlite(data)
  const { statSync } = await import('node:fs')
  const bytes = statSync(info.file).size
  const sha = createHash('sha256').update(await readFile(info.file)).digest('hex').slice(0, 16)
  console.log(`迁移：${info.migrations.join(' + ')}（${info.tables} 张表）`)
  console.log(`demo-data.js ${jsLen} B · demo-data.sqlite ${bytes} B · sha256:${sha}`)
}

if (process.argv[1] && process.argv[1].endsWith('build-demo-data.mjs')) {
  main().catch(e => { console.error('生成失败：' + e.message); process.exitCode = 1 })
}
