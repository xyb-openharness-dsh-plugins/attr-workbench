/**
 * 「一次性初始化」失败的懒重试包装。
 *
 * 2026-10-24 真机实证的坑：插件的 `apply()` 只在**加载那一刻**试一次开库，失败就把
 * `failure` 写死到进程生命周期；而宿主进程是**装包之前**启动的，跑的还是旧代码，
 * 于是用户装好新包、重开工作台，界面永远是同一句「打不开数据库」，只能靠完全退出重开。
 *
 * 这里把它做成"首次失败不锁死"：每次 `ensure()` 若还没有值就再试一次，`retryAfterMs`
 * 内只试一次（防抖，避免坏盘/掉线时把 CPU 打满），成功后清掉上一次的失败原因。
 */

/**
 * @template T
 * @param {() => T} open 打开（可能抛错）的函数
 * @param {{ retryAfterMs?: number, now?: () => number }} [options]
 * @returns {{ ensure: () => T|null, value: () => T|null, failure: () => string|null }}
 */
export function createLazySource(open, { retryAfterMs = 1000, now = () => Date.now() } = {}) {
  let value = null
  let failure = null
  /* 初值必须是 -Infinity 而不是 0：用可控时钟测时起点常是 0，
     写 0 会让"第一次 ensure"被自己的防抖挡掉（看起来像开库完全没发生）。 */
  let lastTry = Number.NEGATIVE_INFINITY

  return {
    /** 拿可用的值；还拿不到就返回 null，原因放 `failure()`。 */
    ensure() {
      if (value) return value
      const stamp = now()
      if (stamp - lastTry < retryAfterMs) return null
      lastTry = stamp
      try {
        value = open()
        failure = null
      } catch (error) {
        value = null
        failure = error instanceof Error ? error.message : String(error)
      }
      return value
    },
    value: () => value,
    failure: () => failure,
  }
}
