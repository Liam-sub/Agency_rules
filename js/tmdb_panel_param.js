/**********************
 TMDB 追剧 Panel（Egern）
 - 参数驱动
 - 单请求串行
 - 强制 $done
**********************/

const args = $argument || "";

function arg(k, d = "") {
  const m = args.match(new RegExp(`${k}=([^&]+)`));
  return m ? decodeURIComponent(m[1]) : d;
}

const TITLE = arg("title", "剧集更新");
const ICON = arg("icon", "tv.fill");
const COLOR = arg("color", "#FF9500");
const TOKEN = arg("token", "");

// 解析剧集参数
let shows = [];
for (let i = 1; i <= 10; i++) {
  const id = arg(`show${i}_id`);
  const name = arg(`show${i}_name`);
  if (id && name) {
    shows.push({ id, name });
  }
}

// ❗ 没 token 或没剧集 → 直接显示
if (!TOKEN || shows.length === 0) {
  $done({
    title: TITLE,
    content: "⚠️ 未配置 token 或剧集",
    icon: ICON,
    color: COLOR
  });
}

// 只查第一个剧集，避免 timeout（Egern 核心点）
const show = shows[0];

const url = `https://api.themoviedb.org/3/tv/${show.id}?language=zh-CN`;

$httpClient.get({
  url,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/json"
  }
}, (err, resp, body) => {
  if (err || !body) {
    finish(`❌ ${show.name}\n请求失败`);
    return;
  }

  try {
    const data = JSON.parse(body);

    let text = `📺 ${show.name}\n`;

    if (data.next_episode_to_air) {
      const ep = data.next_episode_to_air;
      text += `⏰ 下集：S${ep.season_number}E${ep.episode_number}\n`;
      text += `📅 ${ep.air_date}`;
    } else if (data.last_episode_to_air) {
      const ep = data.last_episode_to_air;
      text += `✅ 已更新：S${ep.season_number}E${ep.episode_number}`;
    } else {
      text += `暂无更新信息`;
    }

    finish(text);

  } catch (e) {
    finish(`❌ 数据解析失败`);
  }
});

function finish(content) {
  $done({
    title: TITLE,
    content,
    icon: ICON,
    color: COLOR
  });
}