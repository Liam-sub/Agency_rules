/*********************************
 * TMDB 剧集更新 Panel（参数驱动）
 * Egern / Surge 可用
 *********************************/

function parseArgs(str) {
  const o = {};
  if (!str || typeof str !== "string") return o;
  str.split("&").forEach(p => {
    const [k, v] = p.split("=");
    if (k) o[k] = decodeURIComponent(v || "");
  });
  return o;
}

const cfg = parseArgs($argument);

// ===== 基础配置 =====
const TITLE = cfg.title || "剧集更新";
const ICON = cfg.icon || "tv.fill";
const COLOR = cfg.color || "#FF9500";
const TOKEN = cfg.token;

// ===== 校验 token =====
if (!TOKEN) {
  $done({
    title: TITLE,
    content: "❌ 未配置 TMDB Token",
    icon: "exclamationmark.triangle",
    "icon-color": "#EF476F"
  });
  return;
}

// ===== 解析剧集列表 =====
const SHOWS = [];
let i = 1;
while (cfg[`show${i}_id`]) {
  SHOWS.push({
    id: cfg[`show${i}_id`],
    name: cfg[`show${i}_name`] || `剧集${i}`
  });
  i++;
}

if (SHOWS.length === 0) {
  $done({
    title: TITLE,
    content: "❌ 未配置任何剧集",
    icon: "exclamationmark.triangle",
    "icon-color": "#EF476F"
  });
  return;
}

// ===== 工具函数 =====
function today() {
  return new Date().toISOString().slice(0, 10);
}

function httpGet(url) {
  return new Promise(resolve => {
    $httpClient.get(
      {
        url,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/json"
        },
        timeout: 5000
      },
      (err, resp, body) => {
        if (err || !resp || resp.status !== 200) return resolve(null);
        resolve(body);
      }
    );
  });
}

// ===== 主流程（顺序执行，避免 Panel 静默失败）=====
(async () => {
  const todayStr = today();
  let content = "";
  let hit = 0;

  for (const s of SHOWS) {
    const body = await httpGet(
      `https://api.themoviedb.org/3/tv/${s.id}?language=zh-CN`
    );
    if (!body) continue;

    try {
      const show = JSON.parse(body);

      if (
        show.last_air_date === todayStr &&
        show.last_episode_to_air
      ) {
        const ep = show.last_episode_to_air;
        hit++;

        content += `【${s.name}】\n`;
        content += `🎬 S${ep.season_number}E${ep.episode_number}\n`;
        content += `${ep.name || ""}\n\n`;
      }
    } catch (e) {}
  }

  if (!content) content = "今日暂无剧集更新 😴";

  $done({
    title: TITLE,
    content: content.trim(),
    icon: ICON,
    "icon-color": hit > 0 ? COLOR : "#8E8E93"
  });
})();