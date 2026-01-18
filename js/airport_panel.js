/************************
 机场订阅 Panel（只读缓存）
************************/

const args = $argument || "";

function arg(k, d = "") {
  const m = args.match(new RegExp(`${k}=([^&]+)`));
  return m ? decodeURIComponent(m[1]) : d;
}

const title = arg("title", "机场订阅");
const icon = arg("icon", "airplane.circle.fill");
const color = arg("color", "#0D918D");

const raw = $persistentStore.read("AIRPORT_PANEL_DATA");

if (!raw) {
  $done({
    title,
    content: "暂无数据\n请先运行机场订阅更新脚本",
    icon,
    color: "#999999"
  });
}

let list;
try {
  list = JSON.parse(raw);
} catch {
  list = [];
}

if (list.length === 0) {
  $done({
    title,
    content: "暂无有效机场数据",
    icon,
    color: "#999999"
  });
}

let content = list.map(a =>
`✈️ ${a.name}
📊 ${a.percent}% (${(a.used / 1024 / 1024 / 1024).toFixed(2)} GB)
⏰ 到期：${a.expire}`
).join("\n\n");

$done({
  title,
  content,
  icon,
  color
});