/******************************
 * TMDB 追剧 Panel（最终稳定版）
 * 播出时区：UTC+8（中国）
 ******************************/

const args = $argument || "";
const headers = cfg.tmdb_token
  ? { Authorization: `Bearer ${cfg.tmdb_token}` }
  : {};

$httpClient.get(
  { url, headers },
  callback
);

function parseArgs(str) {
  const o = {};
  str.split("&").forEach(i => {
    const p = i.split("=");
    if (p.length === 2) o[p[0]] = decodeURIComponent(p[1]);
  });
  return o;
}

const cfg = parseArgs(args);

/* ---------- 时间工具（中国时区） ---------- */
function todayCN() {
  const now = new Date();
  const cn = new Date(now.getTime() + 8 * 3600000);
  return cn.toISOString().slice(0, 10);
}

function daysDiffCN(a, b) {
  const d1 = new Date(a + "T00:00:00+08:00");
  const d2 = new Date(b + "T00:00:00+08:00");
  return Math.round((d2 - d1) / 86400000);
}

function cnDate(d) {
  const x = new Date(d + "T00:00:00+08:00");
  return `${x.getMonth() + 1}月${x.getDate()}日`;
}

/* ---------- 剧集列表 ---------- */
const shows = [];
for (let i = 1; i <= 20; i++) {
  if (cfg[`id${i}`]) {
    shows.push({
      id: cfg[`id${i}`],
      name: cfg[`name${i}`] || `剧集${i}`
    });
  }
}

const todayStr = todayCN();
const items = [];

function fetchShow(show) {
  const url = `https://api.themoviedb.org/3/tv/${show.id}?language=zh-CN`;
  return new Promise(resolve => {
    $httpClient.get(url, (err, resp, body) => {
      if (err) return resolve();

      try {
        const d = JSON.parse(body);
        const next = d.next_episode_to_air;
        if (!next || !next.air_date) return resolve();

        const diff = daysDiffCN(todayStr, next.air_date);

        let tag =
          diff === 0 ? "今天" :
          diff === 1 ? "明天" :
          `${diff}天后`;

        items.push({
          title: show.name,
          content: `${tag} · ${cnDate(next.air_date)} 更新第 ${next.episode_number} 集`,
          date: next.air_date
        });
      } catch (_) {}
      resolve();
    });
  });
}

/* ---------- 主流程 ---------- */
(async () => {
  for (const s of shows) {
    await fetchShow(s);
  }

  items.sort((a, b) => a.date.localeCompare(b.date));

  const panel = {
    title: cfg.title || "追剧更新",
    icon: cfg.icon || "tv.circle",
    iconColor: cfg.color || "#0D918D",
    content: items.length
      ? items.map(i => `${i.title}\n${i.content}`).join("\n\n")
      : "暂无即将更新剧集"
  };

  console.log(JSON.stringify(panel));
})();
