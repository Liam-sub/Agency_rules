/**
 * TMDB Tracker for Egern
 */
class TMDBTracker {
  constructor() {
    // 关键优化：从 Egern 环境读取变量
    this.token = $env.TMDB_TOKEN || "";
    this.days = parseInt($env.UPCOMING_DAYS || 7);
    this.shows = this.parseShows($env.SHOWS_LIST);
    
    this.todayStr = new Date().toISOString().slice(0, 10);
  }

  // 解析 "ID:分类" 这种易读格式
  parseShows(str) {
    if (!str) return [];
    return str.split(',').map(item => {
      const [id, cat] = item.trim().split(':');
      return { id: id.trim(), category: cat || "剧集" };
    });
  }

  async fetch(endpoint) {
    return new Promise(resolve => {
      const url = `https://api.themoviedb.org/3/${endpoint}?language=zh-CN`;
      $httpClient.get({
        url,
        headers: { Authorization: `Bearer ${this.token}` }
      }, (err, resp, body) => {
        if (err || !body) resolve(null);
        else resolve(JSON.parse(body));
      });
    });
  }

  async run() {
    if (!this.token) {
      this.finish("⚠️ 请先配置 TMDB_TOKEN");
      return;
    }

    const todayUpdated = [];
    const future = [];

    const tasks = this.shows.map(async (meta) => {
      const show = await this.fetch(`tv/${meta.id}`);
      if (!show) return;

      const base = { name: show.name, category: meta.category, rating: show.vote_average.toFixed(1) };

      // 今日更新判断
      if (show.last_air_date === this.todayStr) {
        todayUpdated.push({ ...base, ...show.last_episode_to_air });
      }
      // 即将更新判断
      if (show.next_episode_to_air) {
        const airDate = show.next_episode_to_air.air_date;
        const diff = Math.ceil((new Date(airDate) - new Date(this.todayStr)) / 86400000);
        if (diff > 0 && diff <= this.days) {
          future.push({ ...base, ...show.next_episode_to_air, diff });
        }
      }
    });

    await Promise.all(tasks);
    this.render(todayUpdated, future.sort((a, b) => a.diff - b.diff));
  }

  render(today, future) {
    let content = "";
    if (today.length) {
      content += "🎬 今日更新\n" + today.map(i => `【${i.name}】S${i.season_number}E${i.episode_number}`).join('\n') + "\n\n";
    }
    if (future.length) {
      content += "📅 即将更新\n" + future.map(i => `【${i.name}】${i.diff}天后 (S${i.season_number}E${i.episode_number})`).join('\n');
    }
    this.finish(content || "近期无更新 😴");
  }

  finish(content) {
    $done({
      title: "📺 TMDB 追剧",
      content: content.trim(),
      icon: "tv",
      "icon-color": "#ff9500",
      "update-time": new Date().toLocaleTimeString()
    });
  }
}

// 立即实例化并运行
new TMDBTracker().run().catch(e => $done({ title: "错误", content: e.message }));
