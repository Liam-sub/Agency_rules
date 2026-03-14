/**
 * TMDB 追剧助手 - Egern 专用版
 * 对齐 YAML 配置: TMDB_TOKEN, UPCOMING_DAYS, SHOWS_LIST
 */

class TMDBTracker {
  constructor() {
    // 1. 直接从 Egern 环境变量读取
    this.token = $env.TMDB_TOKEN;
    this.upcomingDays = parseInt($env.UPCOMING_DAYS || 7);
    this.rawList = $env.SHOWS_LIST || "";
    
    this.todayStr = new Date().toISOString().slice(0, 10);
  }

  // 解析 "ID:分类, ID:分类" 格式
  parseShows() {
    if (!this.rawList) return [];
    return this.rawList.split(',').map(item => {
      const [id, category] = item.trim().split(':');
      return { id: id.trim(), category: category || "剧集" };
    });
  }

  async fetchTMDB(endpoint) {
    return new Promise((resolve) => {
      const url = `https://api.themoviedb.org/3/${endpoint}?language=zh-CN`;
      $httpClient.get(
        {
          url,
          timeout: 5000,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json"
          }
        },
        (err, resp, body) => {
          if (err || !body || resp.status !== 200) resolve(null);
          else resolve(JSON.parse(body));
        }
      );
    });
  }

  async run() {
    // 安全检查
    if (!this.token || this.token.length < 20) {
      this.finish("❌ 请检查 TMDB_TOKEN 配置");
      return;
    }

    const shows = this.parseShows();
    if (shows.length === 0) {
      this.finish("⚠️ 剧集列表为空，请在面板配置");
      return;
    }

    const todayUpdated = [];
    const future = [];

    // 并行抓取
    const tasks = shows.map(async (meta) => {
      const show = await this.fetchTMDB(`tv/${meta.id}`);
      if (!show) return;

      const base = {
        name: show.name || "未知剧集",
        category: meta.category,
        rating: show.vote_average ? show.vote_average.toFixed(1) : "0.0"
      };

      // 今日更新逻辑
      if (show.last_air_date === this.todayStr && show.last_episode_to_air) {
        const e = show.last_episode_to_air;
        todayUpdated.push({ ...base, s: e.season_number, e: e.episode_number });
      }

      // 即将更新逻辑
      if (show.next_episode_to_air) {
        const e = show.next_episode_to_air;
        const diff = Math.ceil((new Date(e.air_date) - new Date(this.todayStr)) / 86400000);
        if (diff > 0 && diff <= this.upcomingDays) {
          future.push({ ...base, s: e.season_number, e: e.episode_number, d: diff, ad: e.air_date });
        }
      }
    });

    await Promise.all(tasks);

    // 排序：按天数由近到远
    future.sort((a, b) => a.d - b.d);

    this.render(todayUpdated, future);
  }

  render(today, upcoming) {
    let content = "";

    if (today.length > 0) {
      content += "🎬 今日已更新\n";
      today.forEach(i => content += `【${i.name}】S${i.s}E${i.e} ⭐${i.rating}\n`);
      content += "\n";
    }

    if (upcoming.length > 0) {
      content += "📅 即将更新\n";
      upcoming.forEach(i => {
        const timeTag = i.d === 1 ? "明天" : `${i.d}天后`;
        content += `【${i.name}】${timeTag} (S${i.s}E${i.e})\n`;
      });
    }

    this.finish(content || "近期暂无剧集更新 😴");
  }

  finish(content) {
    $done({
      title: "📺 TMDB 追剧",
      content: content.trim(),
      icon: "tv",
      "icon-color": "#ff9500",
      "update-time": new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    });
  }
}

// 启动执行
new TMDBTracker().run().catch(e => {
  $done({ title: "脚本错误", content: e.message });
});
