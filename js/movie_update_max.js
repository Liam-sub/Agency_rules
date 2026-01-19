/************************************
 * TMDB 剧集更新 Panel（Surge 终极稳定版）
 * 时区：Asia/Shanghai (UTC+8)
 ************************************/

/*************** 可选配置 ***************/
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MmUwNTI4NWM5YjYxMWI3MjhlOTYzZmM3ZjNiYjk2YiIsIm5iZiI6MTc2ODQwMDcyMi42MTc5OTk4LCJzdWIiOiI2OTY3YTc1MmVhZjg5YzIwMmE4NjY1NDMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.crwmHTGpE_x5azP_O2lx6BaJt74Gk900XcR2A9Fvml4"; // 可留空，不强制（有就填 v4 Read Token）

const SHOWS = [
  { id: 101172, name: "吞噬星空", category: "国漫" },
  { id: 67063,  name: "一人之下", category: "国漫" },

  { id: 30984,  name: "死神：千年血战", category: "日漫" },
  { id: 209867, name: "葬送的芙莉莲", category: "日漫" },
  { id: 117465, name: "地狱乐", category: "日漫" },
  { id: 139060, name: "魔都精兵的奴隶", category: "日漫" },

  { id: 106379, name: "辐射", category: "美剧" },
  { id: 222766, name: "豺狼的日子", category: "美剧" },
  { id: 224372, name: "七王国的骑士", category: "美剧" },
  { id: 249907, name: "判处勇者刑", category: "日漫" }
];

const UPCOMING_DAYS = 7;

/*************** 时间工具（核心） ***************/
// 中国当天日期（YYYY-MM-DD）
function cnToday() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

// 只算“日历天数”，不碰时区、不碰时间
function daysDiffCN(a, b) {
  const d1 = new Date(a.replace(/-/g, "/"));
  const d2 = new Date(b.replace(/-/g, "/"));
  return Math.floor((d2 - d1) / 86400000);
}

/*************** 网络 ***************/
function httpGet(url) {
  return new Promise(resolve => {
    const headers = TMDB_TOKEN
      ? { Authorization: `Bearer ${TMDB_TOKEN}` }
      : {};

    $httpClient.get({ url, headers }, (err, resp, body) => {
      if (err || !resp || resp.status !== 200) return resolve(null);
      resolve(body);
    });
  });
}

/*************** 主逻辑 ***************/
(async () => {
  const today = cnToday();
  const todayList = [];
  const futureList = [];

  for (const s of SHOWS) {
    const body = await httpGet(
      `https://api.themoviedb.org/3/tv/${s.id}?language=zh-CN`
    );
    if (!body) continue;

    try {
      const show = JSON.parse(body);

      const base = {
        name: show.name || s.name,
        category: s.category,
        rating: show.vote_average ? show.vote_average.toFixed(1) : "0.0",
        hot: Math.round(show.popularity || 0)
      };

      /******** 今日已更新（最重要，国漫必靠它） ********/
      if (
        show.last_episode_to_air &&
        show.last_air_date === today
      ) {
        const e = show.last_episode_to_air;
        todayList.push({
          ...base,
          s: e.season_number,
          e: e.episode_number
        });
      }

      /******** 未来更新（只认明确 air_date） ********/
      if (show.next_episode_to_air?.air_date) {
        const e = show.next_episode_to_air;
        const diff = daysDiffCN(today, e.air_date);

        if (diff > 0 && diff <= UPCOMING_DAYS) {
          futureList.push({
            ...base,
            s: e.season_number,
            e: e.episode_number,
            d: diff,
            ad: e.air_date
          });
        }
      }

    } catch (_) {}
  }

  futureList.sort((a, b) => a.d - b.d);

  /*************** Panel 输出 ***************/
  let content = "";

  if (todayList.length) {
    content += "🎬 今日已更新\n";
    todayList.forEach(i => {
      content += `【${i.name}｜${i.category}】 S${i.s}E${i.e}\n`;
      content += `⭐ ${i.rating}  🔥 ${i.hot}\n`;
    });
    content += "\n";
  }

  if (futureList.length) {
    content += "📅 即将更新\n";
    futureList.forEach(i => {
      const when = i.d === 1 ? "明天" : `${i.d} 天后`;
      content += `【${i.name}｜${i.category}】 ${when}\n`;
      content += `S${i.s}E${i.e} · ${i.ad}\n`;
      content += `⭐ ${i.rating}  🔥 ${i.hot}\n\n`;
    });
  }

  if (!content) {
    content = "近期暂无剧集更新";
  }

  $done({
    title: "📺 TMDB 追剧",
    content: content.trim(),
    icon: "tv",
    "icon-color": "#ff9500"
  });
})();
