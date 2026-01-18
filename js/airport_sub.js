/*********************************
 * Egern Panel - 多机场订阅
 *********************************/

const args = $argument || "";

function parseArgs(str) {
  const o = {};
  str.split("&").forEach(p => {
    const [k, v] = p.split("=");
    if (k) o[k] = decodeURIComponent(v || "");
  });
  return o;
}

const cfg = parseArgs(args);

const title = cfg.title || "机场订阅";
const icon = cfg.icon || "airplane";
const color = cfg.color || "#0D918D";

function bytesToGB(b) {
  return (b / 1024 / 1024 / 1024).toFixed(2);
}

function tsToDate(ts) {
  if (!ts) return "未知";
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function httpGet(url) {
  return new Promise(resolve => {
    $httpClient.get({ url, timeout: 5000 }, (err, resp) => {
      if (err || !resp) return resolve(null);
      resolve(resp);
    });
  });
}

(async () => {
  let content = "";
  let i = 1;

  while (cfg[`url${i}`]) {
    const name = cfg[`name${i}`] || `机场${i}`;
    const url = cfg[`url${i}`];

    const resp = await httpGet(url);
    if (!resp) {
      i++;
      continue;
    }

    const info =
      resp.headers["subscription-userinfo"] ||
      resp.headers["Subscription-Userinfo"];

    if (!info) {
      i++;
      continue;
    }

    const data = {};
    info.split(";").forEach(p => {
      const [k, v] = p.trim().split("=");
      data[k] = Number(v);
    });

    const used = (data.upload || 0) + (data.download || 0);
    const total = data.total || 0;

    content += `【${name}】\n`;
    content += `📊 ${bytesToGB(used)} / ${bytesToGB(total)} GB\n`;
    content += `⏰ 到期 ${tsToDate(data.expire)}\n\n`;

    i++;
  }

  if (!content) content = "暂无机场订阅数据";

  $done({
    title,
    content: content.trim(),
    icon,
    "icon-color": color
  });
})();