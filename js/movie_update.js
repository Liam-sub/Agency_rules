/**
 * TMDB 追剧看板（Egern 伪 Panel）
 */

const TMDB_API_KEY = "92e05285c9b611b728e963fc7f3bb96b";
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MmUwNTI4NWM5YjYxMWI3MjhlOTYzZmM3ZjNiYjk2YiIsIm5iZiI6MTc2ODQwMDcyMi42MTc5OTk4LCJzdWIiOiI2OTY3YTc1MmVhZjg5YzIwMmE4NjY1NDMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.crwmHTGpE_x5azP_O2lx6BaJt74Gk900XcR2A9Fvml4";

const SHOWS = [
  { id: 106379, name: "辐射", category: "美剧" },
  { id: 101172, name: "吞噬星空", category: "国漫" },
  { id: 67063,  name: "一人之下", category: "国漫" },
  { id: 30984,  name: "死神：千年血战", category: "日漫" }
];

const UPCOMING_DAYS = 7;

// ========== utils ==========
function httpGet(url) {
  return new Promise(resolve => {
    $httpClient.get(
      {
        url,
        timeout: 5000,
        headers: {
          Authorization: `Bearer ${TMDB_TOKEN}`,
          Accept: "application/json"
        }
      },
      (err, resp, body) => {
        if (err || !resp || resp.status !== 200) resolve(null);
        else resolve(body);
      }
    );
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / 86400000);
}

function cnDate(d) {
  const x = new Date(d);
  return `${x.getMonth() + 1}月${x.getDate()}日`;
}

// ========== main ==========
(async () => {
  const todayStr = today();
  const todayUpdated = [];
  const future = [];

  const tasks = SHOWS.map(s =>
    httpGet(`https://api.themoviedb.org/3/tv/${s.id}?language=zh-CN`)
      .then(b => ({ meta: s, body: b }))
  );

  const res = await Promise.all(tasks);

  res.forEach(r => {
    if (!r.body) return;
    try {
      const show = JSON.parse(r.body);
      const base = {
        name: show.name || r.meta.name,
        category: r.meta.category,
        rating: show.vote_average?.toFixed(1) || "0.0",
        popularity: Math.round(show.popularity || 0)
      };

      if (show.last_air_date === todayStr && show.last_episode_to_air) {
        const e = show.last_episode_to_air;
        todayUpdated.push({ ...base, s: e.season_number, e: e.episode_number });
      }

      if (show.next_episode_to_air) {
        const e = show.next_episode_to_air;
        const d = diffDays(todayStr, e.air_date);
        if (d > 0 && d <= UPCOMING_DAYS) {
          future.push({
            ...base,
            s: e.season_number,
            e: e.episode_number,
            d,
            ad: e.air_date
          });
        }
      }
    } catch (_) {}
  });

  future.sort((a, b) => a.d - b.d);

  // ===== 输出看板内容 =====
  let content = "📺 TMDB 追剧看板\n\n";

  if (todayUpdated.length) {
    content += "🎬 今日已更新\n";
    todayUpdated.forEach(i => {
      content += `【${i.name}｜${i.category}】 S${i.s}E${i.e}\n`;
      content += `⭐${i.rating} 🔥${i.popularity}\n`;
    });
    content += "\n";
  }

  if (future.length) {
    content += "📅 即将更新\n";
    future.forEach(i => {
      const t = i.d === 1 ? "明天" : `${i.d}天后`;
      content += `【${i.name}｜${i.category}】${t}\n`;
      content += `S${i.s}E${i.e} · ${cnDate(i.ad)}\n`;
      content += `⭐${i.rating} 🔥${i.popularity}\n\n`;
    });
  }

  if (!todayUpdated.length && !future.length) {
    content += "近期暂无更新 😴";
  }

  $done({
    title: "追剧看板",
    content: content.trim()
  });
})();