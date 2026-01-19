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
  { id: 249907, name: "判处勇者刑 刑罚勇者9004队服刑记录", category: "日漫" },
  { id: 139060, name: "魔都精兵的奴隶", category: "日漫" },

  { id: 106379, name: "辐射", category: "美剧" },
  { id: 224372, name: "七王国的骑士", category: "美剧"},
  { id: 222766, name: "豺狼的日子", category: "美剧" }
];

const UPCOMING_DAYS = 7;

/******** 时间（中国日历） ********/
function cnToday() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function daysDiff(a, b) {
  const d1 = new Date(a.replace(/-/g, "/"));
  const d2 = new Date(b.replace(/-/g, "/"));
  return Math.floor((d2 - d1) / 86400000);
}

/******** HTTP ********/
function get(url) {
  return new Promise(resolve => {
    $httpClient.get(url, (err, resp, body) => {
      if (err || !resp || resp.status !== 200) return resolve(null);
      resolve(body);
    });
  });
}

/******** 主流程 ********/
(async () => {
  const today = cnToday();
  const todayList = [];
  const futureList = [];

  for (const s of SHOWS) {
    const body = await get(
      `https://api.themoviedb.org/3/tv/${s.id}?language=zh-CN`
    );
    if (!body) continue;

    try {
      const show = JSON.parse(body);

      /** 今日已更新（国漫必须靠这个） */
      if (
        show.last_episode_to_air &&
        show.last_air_date === today
      ) {
        const e = show.last_episode_to_air;
        todayList.push(
          `【${show.name || s.name}｜${s.category}】 S${e.season_number}E${e.episode_number}`
        );
      }

      /** 未来更新（只认明确日期） */
      if (show.next_episode_to_air?.air_date) {
        const e = show.next_episode_to_air;
        const d = daysDiff(today, e.air_date);
        if (d > 0 && d <= UPCOMING_DAYS) {
          futureList.push({
            text: `【${show.name || s.name}｜${s.category}】 ${d === 1 ? "明天" : d + "天后"} S${e.season_number}E${e.episode_number}`,
            d
          });
        }
      }
    } catch {}
  }

  futureList.sort((a, b) => a.d - b.d);

  /** Panel 内容（纯字符串） */
  let output = "";

  if (todayList.length) {
    output += "🎬 今日已更新\n";
    output += todayList.join("\n");
    output += "\n\n";
  }

  if (futureList.length) {
    output += "📅 即将更新\n";
    output += futureList.map(i => i.text).join("\n");
  }

  if (!output) {
    output = "近期暂无剧集更新";
  }

  $done(output.trim());
})();
